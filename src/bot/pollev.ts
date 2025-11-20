import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { Config } from '../config';
import { logger } from '../utils/logger';
import { AIAgent, PollOption, AIResponse } from './ai';
import { TelegramNotifier } from './notifier';

interface PollActivity {
    title: string;
    type: string;
    state: 'opened' | 'closed';
    options: any[];
    instruction_image_url?: string | null;
}

export class PollEvBot {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private ai: AIAgent;
    private notifier: TelegramNotifier;
    private isRunning: boolean = false;
    private lastPollId: string | null = null;

    constructor() {
        this.ai = new AIAgent();
        this.notifier = new TelegramNotifier();
    }

    async notifyStart(day: string, start: string, end: string) {
        await this.notifier.notifyClassStart(day, start, end);
    }

    async notifyStop(day: string) {
        await this.notifier.notifyClassEnd(day);
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info("Starting PollEvBot...");

        try {
            this.browser = await chromium.launch({ headless: Config.HEADLESS });
            this.context = await this.browser.newContext();
            this.page = await this.context.newPage();

            await this.login();
            await this.monitor();
        } catch (error) {
            logger.error(`Fatal error in bot: ${error}`);
            await this.stop();
        }
    }

    async stop() {
        this.isRunning = false;
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        logger.info("PollEvBot stopped.");
    }

    private async login() {
        if (!this.page) return;
        logger.info("Logging in...");
        await this.page.goto(`${Config.POLL_SITE_URL}/login`);

        // Handle email
        await this.page.fill('input[name="username"]', Config.LOGIN_EMAIL!);
        await this.page.click('button:has-text("Next")');

        // Handle password (might need waiting for animation/navigation)
        await this.page.waitForSelector('input[name="password"]');
        await this.page.fill('input[name="password"]', Config.LOGIN_PASSWORD!);
        await this.page.click('button:has-text("Log in")');

        await this.page.waitForURL('**/home');
        logger.info("Login successful.");
    }

    private async monitor() {
        if (!this.page) return;
        logger.info(`Navigating to presenter page: ${Config.POLL_PAGE_URL}`);
        await this.page.goto(Config.POLL_PAGE_URL!);

        while (this.isRunning) {
            try {
                // Extract the 'activity' object from the page
                const activity = await this.page.evaluate(() => {
                    // Try to find the script containing the setup call
                    const scripts = Array.from(document.querySelectorAll('script'));
                    const setupScript = scripts.find(s => s.textContent && s.textContent.includes('window.legacyActivityResponseView.setup'));

                    if (!setupScript || !setupScript.textContent) return undefined;

                    const content = setupScript.textContent;
                    const startMatch = content.match(/activity:\s*(\{)/);
                    if (!startMatch || typeof startMatch.index === 'undefined') return undefined;

                    const startIndex = startMatch.index + "activity: ".length;

                    let braceCount = 0;
                    let endIndex = -1;
                    let foundStart = false;

                    for (let i = startIndex; i < content.length; i++) {
                        if (content[i] === '{') {
                            braceCount++;
                            foundStart = true;
                        } else if (content[i] === '}') {
                            braceCount--;
                        }

                        if (foundStart && braceCount === 0) {
                            endIndex = i + 1;
                            break;
                        }
                    }

                    if (endIndex === -1) return undefined;

                    try {
                        return JSON.parse(content.substring(startIndex, endIndex)) as PollActivity;
                    } catch (e) {
                        return undefined;
                    }
                });

                if (activity && activity.state === 'opened') {
                    const pollId = activity.title; // Using title as ID for simplicity, better to use actual ID if available

                    if (this.lastPollId !== pollId) {
                        this.lastPollId = pollId;
                        logger.info(`New poll detected: ${activity.title}`);
                        await this.handleNewPoll(activity);
                    }
                } else {
                    if (this.lastPollId) {
                        logger.info("Poll closed or no active poll.");
                        this.lastPollId = null;
                    }
                }

                // Wait before next check
                await this.page.waitForTimeout(3000);

                // Reload to get fresh data? Or does PollEv use websockets?
                // PollEv usually pushes updates, but a reload ensures we get the latest state if we missed a socket event.
                // However, constant reloading is detectable. 
                // Better to check if the DOM changed or if 'activity' variable updates automatically.
                // For now, let's assume we might need to refresh occasionally if it's static.
                // But usually, PollEv is dynamic. Let's just wait.
                // If the page is SPA, window.activity might update.
                // Let's try to re-read the DOM if window.activity isn't updating.

                // Strategy: Check for specific DOM elements that indicate a poll is open.
                // If the page content changes, Playwright can see it.

            } catch (error) {
                logger.error(`Error in monitor loop: ${error}`);
                // Wait a bit before retrying to avoid tight loops on error
                await this.page.waitForTimeout(5000);
            }
        }
    }

    private async handleNewPoll(activity: PollActivity) {
        const question = activity.title;
        const options: PollOption[] = activity.options.map((o: any) => ({
            id: o.id,
            value: o.value,
            keyword: o.keyword
        }));
        const imageUrl = activity.instruction_image_url;

        // 1. Send initial poll message
        const messageId = await this.notifier.sendPollQuestion(question, options, imageUrl);

        // 2. Get AI Answer
        const aiResponse = await this.ai.getAnswer(question, options, imageUrl);

        // 3. Update message with AI answer
        if (messageId) {
            await this.notifier.updatePollMessage(messageId, question, options, aiResponse, undefined, imageUrl);
        }

        if (aiResponse) {
            await this.submitAnswer(aiResponse.answer, messageId, question, options, aiResponse, imageUrl);
        }
    }

    private async submitAnswer(answerKeyword: string, messageId: number | null, question: string, options: PollOption[], aiResponse: AIResponse | null, imageUrl?: string | null) {
        if (!this.page) return;
        logger.info(`Submitting answer: ${answerKeyword}`);

        try {
            // More specific selector to avoid matching the presenter bar or other elements
            // Target the vote button that contains the specific answer value or keyword
            // The button has class 'component-response-multiple-choice__option__vote'
            // And inside it has a div with class 'component-response-multiple-choice__option__value'

            // Try to find the option object to get the exact value if possible, otherwise rely on keyword
            const option = options.find(o => o.keyword === answerKeyword);
            let selector = '';

            if (option) {
                // Use the exact value text if we have it, which is safer than just "A" or "B"
                selector = `.component-response-multiple-choice__option__vote:has(.component-response-multiple-choice__option__value:text-is("${option.value}"))`;
            } else {
                // Fallback to just the keyword if we must, but scoped to the option component
                // Note: The keyword itself isn't always visible in the button text in the same way, 
                // but the aria-label usually starts with the value.
                // Let's try to match the button that *contains* the keyword if it's part of the text, 
                // but strictly inside the options list.
                selector = `.component-response-multiple-choice__option__vote:has-text("${answerKeyword}")`;
            }

            // Fallback selector if the specific one fails (e.g. if text-is is too strict with whitespace)
            const fallbackSelector = `.component-response-multiple-choice__option button:has-text("${answerKeyword}")`;

            try {
                await this.page.click(selector, { timeout: 5000 });
            } catch (e) {
                logger.warn(`Primary selector failed, trying fallback: ${fallbackSelector}`);
                await this.page.click(fallbackSelector);
            }

            // await this.notifier.sendMessage(`✅ Submitted answer: ${answerKeyword}`); // Removed to reduce noise

            // Wait for results and check if we need to switch
            // We'll wait a bit for other students to answer
            setTimeout(() => this.checkResultsAndCorrect(answerKeyword, messageId, question, options, aiResponse, imageUrl), 30000);

        } catch (error) {
            logger.error(`Failed to submit answer: ${error}`);
            await this.notifier.sendMessage(`❌ Failed to submit answer: ${error}`);
        }
    }

    private async checkResultsAndCorrect(currentAnswer: string, messageId: number | null, question: string, options: PollOption[], aiResponse: AIResponse | null, imageUrl?: string | null) {
        if (!this.page) return;
        logger.info("Checking results distribution...");

        try {
            const pollOptions = await this.page.$$eval('.component-response-multiple-choice__option', (elements) => {
                return elements.map(el => {
                    // The keyword might not be explicitly in a separate element in all views, 
                    // but usually it is. Let's try to be robust.
                    const keywordEl = el.querySelector('.component-response-multiple-choice__option__keyword');
                    const percentEl = el.querySelector('.component-response-multiple-choice__option__percent');

                    // If keyword element is missing, try to infer from the button text or value
                    let keyword = keywordEl?.textContent?.trim();
                    if (!keyword) {
                        // Fallback: try to find the value text and match it to our known options
                        const valueEl = el.querySelector('.component-response-multiple-choice__option__value');
                        const valueText = valueEl?.textContent?.trim();
                        // We would need to pass options to the eval context to map back, which is complex.
                        // For now, let's assume standard PollEv structure where keyword is usually present in results view.
                    }

                    return {
                        keyword: keyword,
                        percent: percentEl?.textContent?.trim().replace('%', '')
                    };
                });
            });

            if (pollOptions.length === 0 || !pollOptions[0].percent) {
                logger.info("Results not visible yet.");
                return;
            }

            // Map back to our options to ensure we have valid keywords if possible
            // (Skipping complex mapping for now, assuming keywords match A, B, C...)

            // Format stats for Telegram
            const statsText = pollOptions.map(o => `${o.keyword || '?'}: ${o.percent}%`).join('\n');

            // Update the original message with stats
            if (messageId) {
                await this.notifier.updatePollMessage(messageId, question, options, aiResponse, statsText, imageUrl);
            }

            // Find the majority answer
            let maxPercent = -1;
            let majorityKeyword = null;

            for (const opt of pollOptions) {
                const p = parseInt(opt.percent || '0');
                if (p > maxPercent) {
                    maxPercent = p;
                    majorityKeyword = opt.keyword;
                }
            }

            logger.info(`Majority vote is ${majorityKeyword} with ${maxPercent}%`);

            if (majorityKeyword && majorityKeyword !== currentAnswer) {
                logger.info(`Switching answer from ${currentAnswer} to ${majorityKeyword}`);
                await this.notifier.notifyAnswerSwitch(currentAnswer, majorityKeyword);

                // Use the same robust selector logic as submitAnswer
                const option = options.find(o => o.keyword === majorityKeyword);
                let selector = '';
                if (option) {
                    selector = `.component-response-multiple-choice__option__vote:has(.component-response-multiple-choice__option__value:text-is("${option.value}"))`;
                } else {
                    selector = `.component-response-multiple-choice__option__vote:has-text("${majorityKeyword}")`;
                }

                const fallbackSelector = `.component-response-multiple-choice__option button:has-text("${majorityKeyword}")`;

                try {
                    await this.page.click(selector, { timeout: 5000 });
                } catch (e) {
                    logger.warn(`Switching answer: Primary selector failed, trying fallback: ${fallbackSelector}`);
                    await this.page.click(fallbackSelector);
                }

            } else {
                logger.info("Current answer is aligned with majority or results inconclusive.");
            }

        } catch (error) {
            logger.error(`Error checking results: ${error}`);
        }
    }
}

import { Telegraf } from 'telegraf';
import { Config } from '../config';
import { logger } from '../utils/logger';
import { PollOption, AIResponse } from './ai';

export class TelegramNotifier {
    private bot: Telegraf | null = null;
    private chatId: string | undefined;

    constructor() {
        if (Config.TELEGRAM_BOT_TOKEN && Config.TELEGRAM_CHAT_ID) {
            this.bot = new Telegraf(Config.TELEGRAM_BOT_TOKEN);
            this.chatId = Config.TELEGRAM_CHAT_ID;
        } else {
            logger.warn("Telegram credentials missing. Notifications disabled.");
        }
    }

    async sendMessage(message: string): Promise<void> {
        if (!this.bot || !this.chatId) return;
        try {
            await this.bot.telegram.sendMessage(this.chatId, message);
        } catch (error) {
            logger.error(`Failed to send Telegram message: ${error}`);
        }
    }

    async notifyClassStart(day: string, start: string, end: string): Promise<void> {
        await this.sendMessage(`🏫 *Class Started* (${day})\n⏰ ${start} - ${end}\nBot is now monitoring for polls.`);
    }

    async notifyClassEnd(day: string): Promise<void> {
        await this.sendMessage(`🏁 *Class Ended* (${day})\nBot is going to sleep.`);
    }

    private escapeMarkdown(text: string): string {
        return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
    }

    async sendPollQuestion(question: string, options: PollOption[], imageUrl?: string | null): Promise<number | null> {
        if (!this.bot || !this.chatId) return null;

        const optionsText = options.map(o => `${this.escapeMarkdown(o.keyword)}: ${this.escapeMarkdown(o.value)}`).join('\n');
        const msgText = `📊 *New Poll Detected*\n\n*Question:* ${this.escapeMarkdown(question)}\n\n*Options:*\n${optionsText}`;

        try {
            let sentMessage;
            if (imageUrl) {
                sentMessage = await this.bot.telegram.sendPhoto(this.chatId, imageUrl, { caption: msgText, parse_mode: 'MarkdownV2' });
            } else {
                sentMessage = await this.bot.telegram.sendMessage(this.chatId, msgText, { parse_mode: 'MarkdownV2' });
            }
            return sentMessage.message_id;
        } catch (error) {
            logger.error(`Failed to send poll question: ${error}`);
            return null;
        }
    }

    async updatePollMessage(messageId: number, question: string, options: PollOption[], aiResponse: AIResponse | null, stats?: string, imageUrl?: string | null): Promise<void> {
        if (!this.bot || !this.chatId) return;

        const optionsText = options.map(o => `${this.escapeMarkdown(o.keyword)}: ${this.escapeMarkdown(o.value)}`).join('\n');
        let msgText = `📊 *New Poll Detected*\n\n*Question:* ${this.escapeMarkdown(question)}\n\n*Options:*\n${optionsText}`;

        if (aiResponse) {
            msgText += `\n\n🤖 *AI Prediction:*\nAnswer: ${this.escapeMarkdown(aiResponse.answer)}\nConfidence: ${this.escapeMarkdown(aiResponse.confidence.toString())}\nReasoning: ${this.escapeMarkdown(aiResponse.reasoning)}`;
        }

        if (stats) {
            // Stats usually contain % which doesn't need escaping in V2 unless inside code? 
            // Actually . and - need escaping.
            msgText += `\n\n📈 *Class Stats:*\n${this.escapeMarkdown(stats)}`;
        }

        try {
            if (imageUrl) {
                await this.bot.telegram.editMessageCaption(this.chatId, messageId, undefined, msgText, { parse_mode: 'MarkdownV2' });
            } else {
                await this.bot.telegram.editMessageText(this.chatId, messageId, undefined, msgText, { parse_mode: 'MarkdownV2' });
            }
        } catch (error: any) {
            if (error.description && error.description.includes('message is not modified')) {
                // Ignore this error as it means the content hasn't changed
                return;
            }
            logger.error(`Failed to update poll message: ${error}`);
        }
    }
}

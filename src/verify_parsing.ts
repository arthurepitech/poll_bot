import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const RESOURCES_DIR = path.resolve(__dirname, '../ressources');

async function testParsing() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const files = fs.readdirSync(RESOURCES_DIR).filter(f => f.endsWith('.html'));

    for (const file of files) {
        console.log(`\n--- Testing ${file} ---`);
        const filePath = `file://${path.join(RESOURCES_DIR, file)}`;
        await page.goto(filePath);

        try {
            const activity = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script'));
                const setupScript = scripts.find(s => s.textContent && s.textContent.includes('window.legacyActivityResponseView.setup'));

                if (!setupScript || !setupScript.textContent) return null;

                // Extract the activity object string
                // We look for "activity: {" up to ", user:" or just the matching brace
                // Since it's valid JS object notation, we can try to extract the config object passed to setup()

                const content = setupScript.textContent;
                const startMatch = content.match(/activity:\s*(\{)/);
                if (!startMatch || typeof startMatch.index === 'undefined') return null;

                const startIndex = startMatch.index + "activity: ".length;

                // Simple brace counting to find the end of the object
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

                if (endIndex === -1) return null;

                const jsonStr = content.substring(startIndex, endIndex);
                try {
                    return JSON.parse(jsonStr);
                } catch (e) {
                    return null;
                }
            });

            if (activity) {
                console.log(`✅ Found activity object:`);
                console.log(`   Title: ${activity.title}`);
                console.log(`   State: ${activity.state}`);
                console.log(`   Options: ${activity.options.length}`);
                if (activity.instruction_image_url) {
                    console.log(`   Image: ${activity.instruction_image_url}`);
                }
            } else {
                console.log(`❌ No activity object found in ${file}`);
            }

            // Test Result Parsing Logic if it's a result page
            if (file.includes('result')) {
                const options = await page.$$eval('.component-response-multiple-choice__option', (elements) => {
                    return elements.map(el => {
                        const keywordEl = el.querySelector('.component-response-multiple-choice__option__keyword');
                        const percentEl = el.querySelector('.component-response-multiple-choice__option__percent');
                        return {
                            keyword: keywordEl?.textContent?.trim(),
                            percent: percentEl?.textContent?.trim().replace('%', '')
                        };
                    });
                });
                console.log('   Parsed Results:', options);
            }

        } catch (error) {
            console.error(`Error processing ${file}:`);
            if (error instanceof Error) {
                console.error(error.message);
                console.error(error.stack);
            } else {
                console.error(error);
            }
        }
    }

    await browser.close();
}

testParsing().catch(console.error);

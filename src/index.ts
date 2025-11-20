import schedule from 'node-schedule';
import { Config } from './config';
import { logger } from './utils/logger';
import { PollEvBot } from './bot/pollev';

// Validate config on startup
try {
    Config.validate();
} catch (error) {
    logger.error(error);
    process.exit(1);
}

const bot = new PollEvBot();

// Helper to parse time ranges like "12:59-14:25,17:29-18:55"
function parseHours(hoursStr: string | undefined): { start: string, end: string }[] {
    if (!hoursStr) return [];
    return hoursStr.split(',').map(range => {
        const [start, end] = range.trim().split('-');
        return { start, end };
    });
}

// Schedule jobs for each day
const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Helper to check if we are currently in a range
function isNowInRange(range: { start: string, end: string }): boolean {
    const now = new Date();
    const [startHour, startMinute] = range.start.split(':').map(Number);
    const [endHour, endMinute] = range.end.split(':').map(Number);

    const startTime = new Date(now);
    startTime.setHours(startHour, startMinute, 0, 0);

    const endTime = new Date(now);
    endTime.setHours(endHour, endMinute, 0, 0);

    return now >= startTime && now <= endTime;
}

days.forEach((day, index) => {
    const hours = Config.HOURS[day as keyof typeof Config.HOURS];
    if (hours) {
        const ranges = parseHours(hours);
        ranges.forEach(range => {
            const [startHour, startMinute] = range.start.split(':').map(Number);
            const [endHour, endMinute] = range.end.split(':').map(Number);

            // Schedule Start
            const startRule = new schedule.RecurrenceRule();
            startRule.dayOfWeek = index;
            startRule.hour = startHour;
            startRule.minute = startMinute;
            // startRule.tz = 'America/Los_Angeles'; // Optional if system time is wrong

            schedule.scheduleJob(startRule, () => {
                logger.info(`⏰ Starting bot for ${day} class at ${range.start}`);
                // We need to access the notifier from the bot instance, but it's private.
                // Better to make a public method on bot or expose notifier.
                // For now, let's just assume we can add a method to PollEvBot to handle start/stop notifications
                // OR, we can instantiate notifier here too, but that's duplicate.
                // Let's add notifyStart/notifyStop to PollEvBot.
                bot.notifyStart(day, range.start, range.end);
                bot.start();
            });

            // Schedule Stop
            const stopRule = new schedule.RecurrenceRule();
            stopRule.dayOfWeek = index;
            stopRule.hour = endHour;
            stopRule.minute = endMinute;
            // stopRule.tz = 'America/Los_Angeles';

            schedule.scheduleJob(stopRule, () => {
                logger.info(`🛑 Stopping bot for ${day} class at ${range.end}`);
                bot.notifyStop(day);
                bot.stop();
            });

            logger.info(`Scheduled ${day}: ${range.start} - ${range.end}`);

            // Check if we should be running RIGHT NOW
            const currentDayIndex = new Date().getDay();
            const inRange = isNowInRange(range);

            if (currentDayIndex === index && inRange) {
                logger.info(`⚡️ Current time is within ${day} class hours (${range.start} - ${range.end}). Starting immediately.`);
                bot.notifyStart(day, range.start, range.end);
                bot.start();
            }
        });
    }
});

logger.info("Bot scheduler initialized. Waiting for class hours...");

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info("Shutting down...");
    await bot.stop();
    process.exit(0);
});

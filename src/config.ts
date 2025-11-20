import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface Hours {
    monday: string | undefined;
    tuesday: string | undefined;
    wednesday: string | undefined;
    thursday: string | undefined;
    friday: string | undefined;
    saturday: string | undefined;
    sunday: string | undefined;
}

export class Config {
    public static readonly POLL_SITE_URL = process.env.POLL_SITE_URL || "https://pollev.com";
    public static readonly LOGIN_EMAIL = process.env.LOGIN_EMAIL;
    public static readonly LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;
    public static readonly POLL_PAGE_URL = process.env.POLL_PAGE_URL;

    public static readonly TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    public static readonly TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    public static readonly GROQ_API_KEY = process.env.GROQ_API_KEY;
    public static readonly GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-70b-versatile";
    public static readonly HEADLESS = process.env.HEADLESS !== 'false'; // Default to true unless explicitly set to 'false'

    public static readonly HOURS: Hours = {
        monday: process.env.MONDAY_HOURS,
        tuesday: process.env.TUESDAY_HOURS,
        wednesday: process.env.WEDNESDAY_HOURS,
        thursday: process.env.THURSDAY_HOURS,
        friday: process.env.FRIDAY_HOURS,
        saturday: process.env.SATURDAY_HOURS,
        sunday: process.env.SUNDAY_HOURS,
    };

    public static validate(): void {
        const missing: string[] = [];
        if (!Config.LOGIN_EMAIL) missing.push("LOGIN_EMAIL");
        if (!Config.LOGIN_PASSWORD) missing.push("LOGIN_PASSWORD");
        if (!Config.POLL_PAGE_URL) missing.push("POLL_PAGE_URL");
        if (!Config.TELEGRAM_BOT_TOKEN) missing.push("TELEGRAM_BOT_TOKEN");
        if (!Config.TELEGRAM_CHAT_ID) missing.push("TELEGRAM_CHAT_ID");

        if (missing.length > 0) {
            throw new Error(`Missing environment variables: ${missing.join(', ')}`);
        }
    }
}

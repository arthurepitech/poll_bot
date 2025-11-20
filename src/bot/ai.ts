import Groq from 'groq-sdk';
import { Config } from '../config';
import { logger } from '../utils/logger';

export interface PollOption {
    id: string | number;
    value: string;
    keyword: string;
}

export interface AIResponse {
    answer: string;
    confidence: number;
    reasoning: string;
}

export class AIAgent {
    private client: Groq;

    constructor() {
        if (!Config.GROQ_API_KEY) {
            logger.warn("GROQ_API_KEY is not set. AI features will not work.");
        }
        this.client = new Groq({
            apiKey: Config.GROQ_API_KEY,
        });
    }

    async getAnswer(question: string, options: PollOption[], imageUrl?: string | null): Promise<AIResponse | null> {
        if (!Config.GROQ_API_KEY) return null;

        try {
            const optionsText = options.map(o => `- ${o.keyword}: ${o.value}`).join('\n');

            let content: any[] = [
                {
                    type: "text",
                    text: `You are a helpful student assistant. Please answer the following multiple choice question.\n\nQuestion: ${question}\n\nOptions:\n${optionsText}\n\nProvide your answer in JSON format with the following keys: "answer" (the keyword of the correct option, e.g., "A"), "confidence" (0-1), and "reasoning" (brief explanation).`
                }
            ];

            // Use a stable text model as vision previews are decommissioned
            // model: "llama-3.2-90b-vision-preview", 
            const model = Config.GROQ_MODEL;

            if (imageUrl) {
                // logger.warn("Image URL present but using text-only model. Image will be ignored.");
                // content.push({ type: "image_url", image_url: { url: imageUrl } });
            }

            const completion = await this.client.chat.completions.create({
                messages: [
                    {
                        role: "user",
                        content: content[0].text // Send only text content for now
                    }
                ],
                model: model,
                temperature: 0.1,
                response_format: { type: "json_object" }
            });

            const responseContent = completion.choices[0]?.message?.content;
            if (!responseContent) return null;

            return JSON.parse(responseContent) as AIResponse;

        } catch (error) {
            logger.error(`Error getting AI answer: ${error}`);
            return null;
        }
    }
}

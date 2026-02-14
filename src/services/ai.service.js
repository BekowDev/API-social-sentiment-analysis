import { GoogleGenerativeAI } from '@google/generative-ai';

class AIService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('API Key для Gemini не найден в .env');
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL,
            generationConfig: { responseMimeType: 'application/json' },
        });
    }
    async getPostContextSummary(postMedia) {
        try {
            if (!postMedia.buffer)
                return postMedia.text || 'Контекст отсутствует';
            const postText = postMedia.text || 'Текста нет, только медиа';
            const promptParts = [
                {
                    text: `Проанализируй медиа и текст: "${postText}". Верни JSON: { "summary": "Краткое описание происходящего и настроения. Есть ли ирония?" }`,
                },
                {
                    inlineData: {
                        data: postMedia.buffer,
                        mimeType: postMedia.mimeType,
                    },
                },
            ];
            const result = await this.model.generateContent(promptParts);
            const json = JSON.parse(result.response.text());
            return json.summary || 'Описание не получено';
        } catch (e) {
            console.error('Context Error:', e.message);
            return postMedia.text || '';
        }
    }
    async analyzeComments(commentsList, contextSummary) {
        try {
            const texts = commentsList
                .map((c) => c.content)
                .filter((t) => t && t.trim().length > 0);
            if (texts.length === 0) return [];
            const prompt = `
                Ты — эксперт по анализу живого русского языка в Telegram.
                КОНТЕКСТ ПОСТА: "${contextSummary}"

                Твоя задача — классифицировать комментарии.

                📢 ПРАВИЛА (ЧИТАТЬ ВНИМАТЕЛЬНО):

                1. ЭКСПРЕССИВНАЯ ПОХВАЛА (ВАЖНО!):
                   - Сленг типа "афигенно", "жесть как круто", "пипец красиво", "ебать мощно" — ЭТО ПОЗИТИВ (Positive).
                   - Это НЕ токсичность. Это восторг.
                   ✅ "Ну эта просто афигенная красота" -> sentiment: positive, is_toxic: false.
                   ✅ "Пиздец как круто" -> sentiment: positive, is_toxic: false.

                2. МАТ И ТОКСИЧНОСТЬ:
                   - is_toxic: TRUE только если есть агрессия К ЛИЧНОСТИ ("ты урод", "автор дебил").
                   - Просто мат для связки слов ("ну бля бывает") — это НЕ токсик.

                3. САРКАЗМ:
                   - Если пишут "Красота...", но пост про мусорку -> Sarcasm (Negative).

                Входные данные:
                ${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}

                ВЕРНИ СТРОГО JSON:
                [
                    {
                      "sentiment": "positive/negative/neutral",
                      "score": 0.9,
                      "is_toxic": false,
                      "is_sarcastic": false,
                      "emotion": "joy/anger/sadness/admiration (восхищение)/neutral",
                      "explanation": "2-3 слова объяснения"
                    }
                ]
            `;
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            let cleanText = response
                .text()
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
            const data = JSON.parse(cleanText);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error('Analysis Error:', e.message);
            return [];
        }
    }
}

export default new AIService();

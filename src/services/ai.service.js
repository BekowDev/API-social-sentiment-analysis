import { GoogleGenerativeAI } from '@google/generative-ai'

const GEMINI_MODEL_NAME = 'gemini-3-flash-preview'

class AIService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) {
            throw new Error('API Key для Gemini не найден: задайте GEMINI_API_KEY в .env')
        }
        this.genAI = new GoogleGenerativeAI(apiKey)
        this.model = this.genAI.getGenerativeModel({
            model: GEMINI_MODEL_NAME,
            generationConfig: { responseMimeType: 'application/json' },
        })
    }

    async getPostContextSummary(postMedia) {
        try {
            if (!postMedia.buffer) {
                return postMedia.text || 'Контекст отсутствует'
            }
            const postText = postMedia.text || 'Текста нет, только медиа'
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
            ]
            const result = await this.model.generateContent(promptParts)
            const json = JSON.parse(result.response.text())
            return json.summary || 'Описание не получено'
        } catch (e) {
            console.error('Context Error:', e.message)
            return postMedia.text || ''
        }
    }

    async analyzeComments(commentsList, contextSummary) {
        function addTimestampPrefixForAI(commentText) {
            const raw = String(commentText)
            const re = /\d{1,2}:\d{2}(:\d{2})?/g
            const found = raw.match(re)
            if (!found || found.length === 0) {
                return raw
            }
            return '[Пользователь ссылается на таймкод] ' + raw
        }

        try {
            if (!commentsList || commentsList.length === 0) {
                return []
            }

            let lines = ''
            for (let i = 0; i < commentsList.length; i++) {
                const item = commentsList[i]
                let text = ''
                if (item && item.content) {
                    text = String(item.content).trim()
                }
                if (text.length === 0) {
                    text = '(пустой комментарий)'
                } else {
                    text = addTimestampPrefixForAI(text)
                }
                lines += String(i + 1) + '. ' + text + '\n'
            }

            const n = commentsList.length
            const prompt =
                'Ты — эксперт по анализу живого русского языка в интернете (YouTube, Telegram).\n' +
                'КОНТЕКСТ (название и описание видео, тема поста): "' +
                contextSummary +
                '"\n\n' +
                'Твоя задача — классифицировать комментарии.\n\n' +
                'ТАЙМКОДЫ И КОНТЕКСТ ВИДЕО:\n' +
                '- Если в комментарии есть таймкод (например, 48:43), это указание на момент в видео.\n' +
                '- Если в КОНТЕКСТЕ (описании видео) или названии упоминаются технические моменты, шутки или конкретные персонажи (например, аксолотль Эпштейн), то вопросы по этим моментам — это НЕ негатив, а уточнение или интерес.\n' +
                '- Помечай как negative только явную агрессию, хейт или дизлайк контента.\n' +
                '- Комментарии с пометкой "[Пользователь ссылается на таймкод]" содержат ссылку на время в ролике.\n\n' +
                '📢 ПРАВИЛА (ЧИТАТЬ ВНИМАТЕЛЬНО):\n\n' +
                '1. ЭКСПРЕССИВНАЯ ПОХВАЛА (ВАЖНО!):\n' +
                '   - Сленг типа "афигенно", "жесть как круто", "пипец красиво", "ебать мощно" — ЭТО ПОЗИТИВ (Positive).\n' +
                '   - Это НЕ токсичность. Это восторг.\n' +
                '   ✅ "Ну эта просто афигенная красота" -> sentiment: positive, is_toxic: false.\n' +
                '   ✅ "Пиздец как круто" -> sentiment: positive, is_toxic: false.\n\n' +
                '2. МАТ И ТОКСИЧНОСТЬ:\n' +
                '   - is_toxic: TRUE только если есть агрессия К ЛИЧНОСТИ ("ты урод", "автор дебил").\n' +
                '   - Просто мат для связки слов ("ну бля бывает") — это НЕ токсик.\n\n' +
                '3. САРКАЗМ:\n' +
                '   - Если пишут "Красота...", но пост про мусорку -> Sarcasm (Negative).\n\n' +
                'Входные данные (ровно ' +
                String(n) +
                ' комментариев, порядок важен):\n' +
                lines +
                '\n' +
                'ВЕРНИ СТРОГО JSON — массив из ровно ' +
                String(n) +
                ' объектов в том же порядке, что и номера выше:\n' +
                '[\n' +
                '  {\n' +
                '    "sentiment": "positive/negative/neutral",\n' +
                '    "score": 0.9,\n' +
                '    "is_toxic": false,\n' +
                '    "is_sarcastic": false,\n' +
                '    "emotion": "joy/anger/sadness/admiration (восхищение)/neutral",\n' +
                '    "explanation": "2-3 слова объяснения"\n' +
                '  }\n' +
                ']\n'

            const result = await this.model.generateContent(prompt)
            const response = result.response
            let cleanText = response.text()
            cleanText = cleanText.replace(/```json/g, '')
            cleanText = cleanText.replace(/```/g, '')
            cleanText = cleanText.trim()

            const data = JSON.parse(cleanText)
            if (!Array.isArray(data)) {
                return []
            }
            if (data.length === 0) {
                return []
            }
            return data
        } catch (e) {
            console.error('Analysis Error:', e.message)
            return []
        }
    }
}

export default new AIService()

import axios from 'axios'

class AIService {
    constructor() {
        this.pythonUrl = 'http://localhost:8000/analyze' // Адрес Python сервера
        this.apiKey = 'python_secret_key' // Тот самый ключ из Python кода
    }

    async analyzeComments(commentsList) {
        try {
            // Формируем массив просто текстов (Python ждет List[str])
            // Фильтруем пустые, чтобы не грузить ИИ зря
            const texts = commentsList
                .map((c) => c.content)
                .filter((t) => t && t.trim().length > 0)

            if (texts.length === 0) return []

            console.log(`🤖 Отправляю ${texts.length} комментариев в ИИ...`)

            const response = await axios.post(
                this.pythonUrl,
                { comments: texts },
                {
                    headers: {
                        'x-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                },
            )

            return response.data // Возвращаем массив с результатами
        } catch (e) {
            console.error('Ошибка связи с AI сервисом:', e.message)
            // Если ИИ упал, не ломаем всё приложение, а возвращаем null
            return null
        }
    }
}

export default new AIService()

// Сейчас вы читаете process.env в разных местах. Соберем всё в одном месте. Если нужно будет сменить ключи перед демо — вы сделаете это тут.
import dotenv from 'dotenv'
dotenv.config()

export const config = {
    // Порт сервера
    port: process.env.PORT || 5001,

    // База данных
    mongoUri: process.env.MONGO_URI,

    // Секретный ключ JWT (с запаской, чтобы не упало если .env пустой)
    jwtSecret: process.env.JWT_SECRET || 'dev_fallback_secret',

    // Настройки Telegram (берем из .env или твои рабочие цифры для страховки)
    telegram: {
        apiId: parseInt(process.env.TG_API_ID) || 34175562,
        apiHash: process.env.TG_API_HASH || '1a6e4bccb1e09c9c1afd72ca62cf23d3',
    },

    // Настройки ИИ (Python)
    ai: {
        url: process.env.AI_URL || 'http://localhost:8000/analyze',
        key: process.env.AI_KEY || 'python_secret_key',
    },
}

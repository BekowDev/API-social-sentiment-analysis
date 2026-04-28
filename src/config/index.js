import dotenv from 'dotenv'
dotenv.config()

const telegramApiIdCandidate = Number.parseInt(
    process.env.TELEGRAM_API_ID || '',
    10,
)
const telegramApiId = Number.isInteger(telegramApiIdCandidate)
    ? telegramApiIdCandidate
    : null

export const config = {
    port: process.env.PORT,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,

    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    geminiTextModel: process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash',
    geminiMultimodalModel:
        process.env.GEMINI_MULTIMODAL_MODEL || 'gemini-1.5-flash',
    // Backward-compatible aliases for legacy references.
    gemeniApiKey: process.env.GEMINI_API_KEY,
    gemeniModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    gemeniTextModel: process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash',
    gemeniMultimodalModel:
        process.env.GEMINI_MULTIMODAL_MODEL || 'gemini-1.5-flash',

    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,

    youtubeApiKey: process.env.YOUTUBE_API_KEY,

    telegram: {
        apiId: telegramApiId,
        apiHash: process.env.TELEGRAM_API_HASH,
        serverSession: process.env.TELEGRAM_SERVER_SESSION,
    },
    rateLimit: {
        windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10) || 15 * 60 * 1000,
        maxRequests:
            Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '', 10) || 120,
    },
}

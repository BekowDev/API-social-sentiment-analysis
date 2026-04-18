import dotenv from 'dotenv'
dotenv.config()
export const config = {
    port: process.env.PORT,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,

    gemeniApiKey: process.env.GEMINI_API_KEY,
    gemeniModel: process.env.GEMINI_MODEL,
    gemeniTextModel: process.env.GEMINI_TEXT_MODEL,
    gemeniMultimodalModel: process.env.GEMINI_MULTIMODAL_MODEL,

    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,

    youtubeApiKey: process.env.YOUTUBE_API_KEY,

    telegram: {
        apiId: parseInt(process.env.TELEGRAM_API_ID),
        apiHash: process.env.TELEGRAM_API_HASH,
        serverSession: process.env.TELEGRAM_SERVER_SESSION,
    },
}

import dotenv from 'dotenv'
dotenv.config()
export const config = {
    port: process.env.PORT,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,

    gemeniApiKey: process.env.GEMINI_API_KEY,
    gemeniModel: process.env.GEMINI_MODEL,

    telegram: {
        apiId: parseInt(process.env.TG_API_ID),
        apiHash: process.env.TG_API_HASH,
    },
}

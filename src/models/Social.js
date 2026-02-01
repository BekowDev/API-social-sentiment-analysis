import { Schema, model } from 'mongoose'

const SocialSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        platform: {
            type: String,
            required: true,
            enum: ['telegram', 'vk', 'youtube', 'custom'], // Добавляем список сервисов
        },
        // Используем Mixed тип, чтобы хранить и токены, и ссылки, и что угодно
        credentials: {
            type: Schema.Types.Mixed,
            required: true,
        },
        accountName: { type: String }, // Например, @my_bot или "Мой Канал"
        status: {
            type: String,
            enum: ['active', 'error', 'pending'],
            default: 'active',
        },
    },
    { timestamps: true },
)

export default model('Social', SocialSchema)

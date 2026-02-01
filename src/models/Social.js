import { Schema, model } from 'mongoose'

const SocialSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        platform: {
            type: String,
            required: true,
            enum: ['telegram', 'vk', 'youtube', 'custom'],
        },
        credentials: {
            type: Schema.Types.Mixed,
            required: true,
        },
        accountName: {
            type: String,
        },
        status: {
            type: String,
            enum: ['active', 'error', 'pending'],
            default: 'active',
        },
    },
    {
        timestamps: true,
    },
)

export default model('Social', SocialSchema)

import mongoose from 'mongoose'

const CommentSchema = new mongoose.Schema(
    {
        comment_id: { type: String },
        author_name: { type: String },
        text: { type: String },
        content: { type: String },

        date: { type: String },

        analysis: {
            sentiment: { type: String },
            score: { type: Number },
            is_toxic: { type: Boolean },
            lang: { type: String },
        },
    },
    { _id: false },
)

const AnalysisSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    taskId: { type: String, index: true },
    platform: { type: String, required: true },
    phoneNumber: { type: String },
    postLink: { type: String },

    stats: {
        total: { type: Number, default: 0 },
        positive: { type: Number, default: 0 },
        negative: { type: Number, default: 0 },
        neutral: { type: Number, default: 0 },
        toxic: { type: Number, default: 0 },
    },
    sentiment_stats: {
        total: { type: Number, default: 0 },
        positive: { type: Number, default: 0 },
        negative: { type: Number, default: 0 },
        neutral: { type: Number, default: 0 },
        toxic: { type: Number, default: 0 },
    },

    reactions: [
        {
            emoji: String,
            count: Number,
        },
    ],

    comments: [CommentSchema],

    aiSummary: {
        content: { type: String, default: '' },
        keyPoints: [{ type: String }],
    },

    postSummary: { type: String, default: '' },

    executionTime: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
})

export default mongoose.model('Analysis', AnalysisSchema)

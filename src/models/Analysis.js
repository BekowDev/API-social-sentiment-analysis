import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema(
    {
        comment_id: { type: Number },
        author_name: { type: String },
        content: { type: String },

        date: { type: Number },

        analysis: {
            sentiment: { type: String },
            score: { type: Number },
            is_toxic: { type: Boolean },
            lang: { type: String },
        },
    },
    { _id: false }
);

const AnalysisSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
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

    reactions: [
        {
            emoji: String,
            count: Number,
        },
    ],

    comments: [CommentSchema],

    executionTime: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Analysis', AnalysisSchema);

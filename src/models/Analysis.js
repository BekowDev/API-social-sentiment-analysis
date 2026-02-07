import mongoose from 'mongoose';

const AnalysisSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    platform: { type: String, default: 'telegram' },
    postLink: { type: String, required: true },
    phoneNumber: { type: String },

    stats: {
        total: { type: Number, default: 0 },
        positive: { type: Number, default: 0 },
        negative: { type: Number, default: 0 },
        neutral: { type: Number, default: 0 },
        toxic: { type: Number, default: 0 },
    },

    comments: [
        {
            author_name: String,
            content: String,
            analysis: {
                sentiment: String,
                score: Number, // <--- БЫЛО: confidence, СТАЛО: score
                is_toxic: Boolean,
            },
        },
    ],
    executionTime: { type: Number, default: 0 }, // Храним время в мс
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Analysis', AnalysisSchema);

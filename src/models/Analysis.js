import mongoose from 'mongoose';

// 1. Создадим схему для одного комментария, чтобы ничего не терялось
const CommentSchema = new mongoose.Schema(
    {
        comment_id: { type: Number },
        author_name: { type: String },
        content: { type: String },

        // 👇👇👇 ВОТ ЭТОГО НЕ ХВАТАЛО! 👇👇👇
        date: { type: Number }, // Храним дату как число (Timestamp)

        analysis: {
            sentiment: { type: String },
            score: { type: Number },
            is_toxic: { type: Boolean },
            lang: { type: String },
        },
    },
    { _id: false },
); // _id для под-документов не обязателен

// 2. Основная схема
const AnalysisSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    platform: { type: String, required: true },
    phoneNumber: { type: String },
    postLink: { type: String },

    // Статистика
    stats: {
        total: { type: Number, default: 0 },
        positive: { type: Number, default: 0 },
        negative: { type: Number, default: 0 },
        neutral: { type: Number, default: 0 },
        toxic: { type: Number, default: 0 },
    },

    // Реакции
    reactions: [
        {
            emoji: String,
            count: Number,
        },
    ],

    // Массив комментариев (используем нашу схему)
    comments: [CommentSchema],

    executionTime: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Analysis', AnalysisSchema);

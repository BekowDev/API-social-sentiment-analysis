import SocialAccount from '../models/Social.js';
import Analysis from '../models/Analysis.js';
import SocialFactory from '../services/social/social.factory.js';
import aiService from '../services/ai.service.js';

class SocialController {
    // --- 1. Отправка кода ---
    async sendCode(req, res, next) {
        try {
            const { phoneNumber, platform = 'telegram' } = req.body;
            const provider = SocialFactory.getProvider(platform);
            const result = await provider.sendCode(phoneNumber);
            res.json(result);
        } catch (e) {
            next(e);
        }
    }

    // --- 2. Верификация ---
    async verifyCode(req, res, next) {
        try {
            const {
                phoneNumber,
                code,
                password,
                platform = 'telegram',
            } = req.body;
            const provider = SocialFactory.getProvider(platform);
            const session = await provider.signIn(phoneNumber, code, password);

            await SocialAccount.findOneAndUpdate(
                { userId: req.user.id, platform },
                {
                    accountName: phoneNumber,
                    credentials: session,
                    status: 'active',
                },
                { upsert: true, new: true }
            );

            res.json({ success: true, message: 'Успешный вход' });
        } catch (e) {
            next(e);
        }
    }

    // --- 3. АНАЛИЗ (TURBO MODE ⚡) ---
    async analyzePost(req, res, next) {
        const startTime = Date.now();

        try {
            const { phoneNumber, postLink, platform = 'telegram' } = req.body;

            // 1. Поиск аккаунта
            const account = await SocialAccount.findOne({
                userId: req.user.id,
                accountName: phoneNumber,
                platform,
            });

            if (!account)
                return res.status(401).json({ message: 'Аккаунт не найден' });

            const provider = SocialFactory.getProvider(
                platform,
                account.credentials
            );

            console.log('🚀 Старт анализа...');

            // 2. Параллельное скачивание (Медиа + Комменты + Реакции)
            const [postMedia, rawComments, reactions] = await Promise.all([
                provider.getPostMedia(postLink),
                provider.getComments(postLink),
                provider.getPostReactions(postLink),
            ]);

            console.log(
                `📥 Скачано: ${rawComments.length} комментов. Получаю контекст...`
            );

            // 3. Контекст поста (1 раз)
            const contextSummary =
                await aiService.getPostContextSummary(postMedia);

            // 4. ОПТИМИЗАЦИЯ: Разбиваем на мелкие пачки по 15 штук
            const BATCH_SIZE = 15;
            const batches = [];
            for (let i = 0; i < rawComments.length; i += BATCH_SIZE) {
                batches.push(rawComments.slice(i, i + BATCH_SIZE));
            }

            console.log(`⚡ Запуск ${batches.length} потоков параллельно...`);

            // 5. ПАРАЛЛЕЛЬНЫЙ ЗАПУСК
            const aiPromises = batches.map(async (batch, index) => {
                // Небольшая задержка (20мс), чтобы не "положить" сеть мгновенным ударом
                await new Promise((r) => setTimeout(r, index * 20));
                return aiService.analyzeComments(batch, contextSummary);
            });

            // Ждем выполнения всех потоков сразу
            const resultsArrays = await Promise.all(aiPromises);
            const aiResults = resultsArrays.flat();

            console.log('✅ AI завершил работу. Сборка данных...');

            // 6. Объединение результатов
            const finalComments = rawComments.map((comment, index) => {
                const ai = aiResults[index] || {};

                return {
                    ...comment,
                    analysis: {
                        sentiment: ai.sentiment || 'neutral',
                        score: ai.score || 0.5,
                        is_toxic: ai.is_toxic || false,
                        is_sarcastic: ai.is_sarcastic || false,
                        emotion: ai.emotion || 'neutral',
                        explanation: ai.explanation || '',
                    },
                };
            });

            // 7. Статистика
            const stats = {
                total: finalComments.length,
                positive: finalComments.filter(
                    (c) => c.analysis.sentiment === 'positive'
                ).length,
                negative: finalComments.filter(
                    (c) => c.analysis.sentiment === 'negative'
                ).length,
                neutral: finalComments.filter(
                    (c) => c.analysis.sentiment === 'neutral'
                ).length,
                toxic: finalComments.filter((c) => c.analysis.is_toxic === true)
                    .length,
                sarcastic: finalComments.filter(
                    (c) => c.analysis.is_sarcastic === true
                ).length,
            };

            const duration = Date.now() - startTime;

            // 8. Сохранение
            const newAnalysis = new Analysis({
                userId: req.user.id,
                platform,
                postLink,
                phoneNumber,
                stats,
                comments: finalComments,
                reactions,
                executionTime: duration,
                postSummary: contextSummary,
            });

            await newAnalysis.save();

            console.log(`🏁 Готово за ${(duration / 1000).toFixed(2)} сек`);
            res.json(newAnalysis);
        } catch (e) {
            console.error('❌ Ошибка:', e);
            res.status(500).json({ message: e.message });
        }
    }

    // --- 4. История ---
    async getHistory(req, res, next) {
        try {
            const history = await Analysis.find({ userId: req.user.id })
                .sort({ createdAt: -1 })
                .select(
                    'postLink stats createdAt platform executionTime postSummary'
                );
            res.json(history);
        } catch (e) {
            next(e);
        }
    }

    // --- 5. Детали ---
    async getAnalysisById(req, res, next) {
        try {
            const analysis = await Analysis.findOne({
                _id: req.params.id,
                userId: req.user.id,
            });
            if (!analysis)
                return res.status(404).json({ message: 'Анализ не найден' });
            res.json(analysis);
        } catch (e) {
            next(e);
        }
    }
}

export default new SocialController();

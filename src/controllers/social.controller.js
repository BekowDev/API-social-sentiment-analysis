import SocialAccount from '../models/Social.js'; // Проверь путь к файлу модели!
import Analysis from '../models/Analysis.js';
import SocialFactory from '../services/social/social.factory.js';
import aiService from '../services/ai.service.js';

class SocialController {
    // 1. Отправка кода
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

    // 2. Верификация кода
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
                { accountName: phoneNumber, credentials: session },
                { upsert: true, new: true },
            );

            res.json({ success: true });
        } catch (e) {
            next(e);
        }
    }

    // 3. АНАЛИЗ ПОСТА (ИСПРАВЛЕННЫЙ)
    async analyzePost(req, res, next) {
        // <--- 1. ВАЖНО: Объявляем таймер в самом начале
        const startTime = Date.now();

        try {
            const { phoneNumber, postLink, platform = 'telegram' } = req.body;

            // 1. Получаем аккаунт
            const account = await SocialAccount.findOne({
                userId: req.user.id,
                accountName: phoneNumber,
                platform,
            });

            if (!account)
                return res.status(401).json({ message: 'Аккаунт не найден' });

            // 2. Инициализация провайдера
            const provider = SocialFactory.getProvider(
                platform,
                account.credentials,
            );

            // --- ИЗМЕНЕНИЕ: Скачиваем И комментарии, И реакции параллельно ---
            console.log('Скачиваю комментарии и реакции...');

            // Используем Promise.all, чтобы не ждать по очереди
            const [rawComments, reactions] = await Promise.all([
                provider.getComments(postLink), // Твой метод для комментов
                provider.getPostReactions(postLink), // Твой новый метод для реакций
            ]);

            console.log(
                `Скачано: ${rawComments.length} сообщений, ${reactions.length} типов реакций`,
            );

            // 3. ПАКЕТНАЯ ОБРАБОТКА (BATCHING)
            const BATCH_SIZE = 20;
            const aiResults = [];

            for (let i = 0; i < rawComments.length; i += BATCH_SIZE) {
                const batch = rawComments.slice(i, i + BATCH_SIZE);
                console.log(`Анализирую партию ${i} - ${i + BATCH_SIZE}...`);
                const batchResult = await aiService.analyzeComments(batch);
                if (batchResult) {
                    aiResults.push(...batchResult);
                }
            }

            // 4. Объединение результатов + УМНАЯ ТОКСИЧНОСТЬ
            const finalComments = rawComments.map((comment, index) => {
                const ai = aiResults[index];

                // Логика определения токсичности
                let isToxic = false;
                if (ai) {
                    if (ai.is_toxic === true) isToxic = true;
                    // Если негатив > 80%, тоже считаем токсичным
                    else if (ai.sentiment === 'negative' && ai.score > 0.8)
                        isToxic = true;
                }

                return {
                    ...comment,
                    analysis: ai
                        ? {
                              sentiment: ai.sentiment,
                              score: ai.score,
                              is_toxic: isToxic,
                              lang: ai.language,
                          }
                        : { sentiment: 'neutral', score: 0.5, is_toxic: false },
                };
            });

            // 5. Статистика
            const stats = {
                total: finalComments.length,
                positive: finalComments.filter(
                    (c) => c.analysis?.sentiment === 'positive',
                ).length,
                negative: finalComments.filter(
                    (c) => c.analysis?.sentiment === 'negative',
                ).length,
                neutral: finalComments.filter(
                    (c) => c.analysis?.sentiment === 'neutral',
                ).length,
                toxic: finalComments.filter(
                    (c) => c.analysis?.is_toxic === true,
                ).length,
            };

            // 6. Подсчет времени и Сохранение
            const endTime = Date.now();
            const duration = endTime - startTime;

            const newAnalysis = new Analysis({
                userId: req.user.id,
                platform,
                postLink,
                phoneNumber,
                stats,
                comments: finalComments,
                executionTime: duration,
                reactions: reactions, // <--- ВАЖНО: Добавили реакции при сохранении
            });

            await newAnalysis.save();

            console.log(`Анализ завершен за ${duration}мс`);
            res.json(newAnalysis);
        } catch (e) {
            console.error('Ошибка анализа:', e);
            res.status(500).json({ message: 'Ошибка анализа: ' + e.message });
        }
    }

    // 4. Получение истории
    async getHistory(req, res, next) {
        try {
            const history = await Analysis.find({ userId: req.user.id })
                .sort({ createdAt: -1 })
                // <--- 3. ВАЖНО: Добавили executionTime в выборку
                .select('postLink stats createdAt platform executionTime');
            res.json(history);
        } catch (e) {
            next(e);
        }
    }

    // 5. Получение деталей
    async getAnalysisById(req, res, next) {
        try {
            const analysis = await Analysis.findOne({
                _id: req.params.id,
                userId: req.user.id,
            });

            if (!analysis) {
                return res.status(404).json({ message: 'Анализ не найден' });
            }
            res.json(analysis);
        } catch (e) {
            next(e);
        }
    }
}

export default new SocialController();

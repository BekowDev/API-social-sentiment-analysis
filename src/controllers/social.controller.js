import SocialAccount from '../models/Social.js'
import Analysis from '../models/Analysis.js'
import SocialFactory from '../services/social/social.factory.js'
import aiService from '../services/ai.service.js'
import {
    addAnalysisTask,
    getAnalysisTaskById,
} from '../services/queue.service.js'
import {
    detectPlatformFromTargetUrl,
    getUserIdFromTokenPayload,
} from '../utils/auth-request.util.js'

class SocialController {
    async sendCode(req, res, next) {
        try {
            const { phoneNumber, platform = 'telegram' } = req.body
            const provider = SocialFactory.getProvider(platform)
            const result = await provider.sendCode(phoneNumber)
            res.json(result)
        } catch (e) {
            next(e)
        }
    }

    async verifyCode(req, res, next) {
        try {
            const {
                phoneNumber,
                code,
                password,
                platform = 'telegram',
            } = req.body
            const provider = SocialFactory.getProvider(platform)
            const session = await provider.signIn(phoneNumber, code, password)

            const uid = getUserIdFromTokenPayload(req.user)
            if (!uid) {
                return res.status(401).json({
                    message: 'Не удалось определить пользователя по токену',
                })
            }

            await SocialAccount.findOneAndUpdate(
                { userId: uid, platform },
                {
                    accountName: phoneNumber,
                    credentials: session,
                    status: 'active',
                },
                { upsert: true, new: true },
            )

            res.json({ success: true, message: 'Успешный вход' })
        } catch (e) {
            next(e)
        }
    }

    async analyzePost(req, res, next) {
        const startTime = Date.now()

        try {
            const { phoneNumber, mode = 'fast' } = req.body
            const normalizedMode = mode === 'deep' ? 'deep' : 'fast'
            const targetUrl = req.body.url || req.body.postLink || ''

            const detected = detectPlatformFromTargetUrl(targetUrl)
            if (!detected) {
                return res
                    .status(400)
                    .json({ message: 'Неподдерживаемая ссылка' })
            }
            const platform = detected

            const userId = getUserIdFromTokenPayload(req.user)
            if (!userId) {
                return res.status(401).json({
                    message: 'Не удалось определить пользователя по токену',
                })
            }

            let account = null
            if (platform === 'telegram') {
                account = await SocialAccount.findOne({
                    userId,
                    accountName: phoneNumber,
                    platform: 'telegram',
                })
                if (!account) {
                    return res.status(401).json({ message: 'Аккаунт не найден' })
                }
            }

            const credentials =
                account && account.credentials ? account.credentials : {}

            const provider = SocialFactory.getProvider(
                platform,
                credentials,
                targetUrl,
            )

            if (normalizedMode === 'deep') {
                const job = await addAnalysisTask({
                    userId,
                    phoneNumber,
                    postLink: targetUrl,
                    platform,
                    mode: normalizedMode,
                })

                return res.json({
                    status: 'processing',
                    taskId: String(job.id),
                    message: 'Анализ запущен в фоне',
                })
            }

            console.log('Старт анализа...')

            // 2. Параллельное скачивание (Медиа + Комменты + Реакции)
            const [postMedia, commentsPayload, reactions] = await Promise.all([
                provider.getPostMedia(targetUrl),
                provider.getComments(targetUrl, normalizedMode),
                provider.getPostReactions(targetUrl),
            ])

            const normalized = SocialFactory.normalizeCommentsForAnalysis(
                commentsPayload,
            )
            const comments = normalized.rawComments
            const youtubePostContext = normalized.youtubePostContext

            console.log(
                `Скачано: ${comments.length} комментов. Получаю контекст...`,
            )

            let mediaForContext = postMedia
            if (youtubePostContext) {
                const baseText = postMedia.text || ''
                mediaForContext = {
                    ...postMedia,
                    text: baseText + '\n' + youtubePostContext,
                }
            }
            const postContext =
                await aiService.getPostContextSummary(mediaForContext)

            const aiResults = await aiService.analyzeComments(
                comments,
                postContext,
            )

            console.log('AI завершил работу. Сборка данных...')

            for (let i = 0; i < comments.length; i++) {
                const ai = aiResults[i]
                if (ai != null && typeof ai === 'object') {
                    comments[i].analysis = {
                        sentiment: ai.sentiment || 'neutral',
                        score:
                            typeof ai.score === 'number' ? ai.score : 0.5,
                        is_toxic: Boolean(ai.is_toxic),
                        is_sarcastic: Boolean(ai.is_sarcastic),
                        emotion: ai.emotion || 'neutral',
                        explanation: ai.explanation || '',
                    }
                } else {
                    comments[i].analysis = {
                        sentiment: 'neutral',
                        score: 0.5,
                        is_toxic: false,
                        is_sarcastic: false,
                        emotion: 'neutral',
                        explanation: '',
                    }
                }
            }

            let positive = 0
            let negative = 0
            let neutral = 0
            let toxic = 0
            for (let i = 0; i < comments.length; i++) {
                const a = comments[i].analysis
                if (!a) {
                    continue
                }
                if (a.sentiment === 'positive') {
                    positive += 1
                } else if (a.sentiment === 'negative') {
                    negative += 1
                } else if (a.sentiment === 'neutral') {
                    neutral += 1
                }
                if (a.is_toxic === true) {
                    toxic += 1
                }
            }

            const stats = {
                total: comments.length,
                positive,
                negative,
                neutral,
                toxic,
            }

            const duration = Date.now() - startTime

            const newAnalysis = new Analysis({
                userId,
                platform,
                postLink: targetUrl,
                phoneNumber,
                stats,
                comments,
                reactions,
                executionTime: duration,
                postSummary: postContext,
            })

            await newAnalysis.save()

            console.log(`Готово за ${(duration / 1000).toFixed(2)} сек`)
            res.json(newAnalysis)
        } catch (e) {
            console.error('Ошибка:', e)
            res.status(500).json({ message: e.message })
        }
    }

    async getTaskStatus(req, res, next) {
        try {
            const { taskId } = req.params

            const analysis = await Analysis.findOne({
                userId: req.user.id,
                taskId: String(taskId),
            })

            if (analysis) {
                return res.json({
                    status: 'completed',
                    taskId: String(taskId),
                    result: analysis,
                })
            }

            const job = await getAnalysisTaskById(taskId)
            if (!job) {
                return res.status(404).json({
                    status: 'not_found',
                    taskId: String(taskId),
                    message: 'Задача не найдена',
                })
            }

            const state = await job.getState()
            return res.json({
                status: state,
                taskId: String(taskId),
            })
        } catch (e) {
            next(e)
        }
    }

    async getHistory(req, res, next) {
        try {
            const history = await Analysis.find({ userId: req.user.id })
                .sort({ createdAt: -1 })
                .select(
                    'postLink stats createdAt platform executionTime postSummary',
                )
            res.json(history)
        } catch (e) {
            next(e)
        }
    }

    async getAnalysisById(req, res, next) {
        try {
            const analysis = await Analysis.findOne({
                _id: req.params.id,
                userId: req.user.id,
            })
            if (!analysis)
                return res.status(404).json({ message: 'Анализ не найден' })
            res.json(analysis)
        } catch (e) {
            next(e)
        }
    }
}

export default new SocialController()

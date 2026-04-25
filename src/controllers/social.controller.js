import Analysis from '../models/Analysis.js'
import {
    addAnalysisTask,
    getAnalysisTaskById,
} from '../services/queue.service.js'
import {
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from '../shared/errors.js'
import { sendSuccess } from '../shared/response.util.js'
import {
    detectPlatformFromTargetUrl,
    getUserIdFromTokenPayload,
} from '../utils/auth-request.util.js'

function deriveProgressMessage(progressValue, state) {
    if (typeof progressValue === 'number') {
        if (progressValue >= 90) {
            return 'Финальная обработка и сохранение результатов...'
        }
        if (progressValue >= 60) {
            return 'Отправка данных в Gemini AI для анализа тональности...'
        }
        if (progressValue >= 30) {
            return 'Сбор комментариев и данных о реакциях...'
        }
        if (progressValue >= 10) {
            return 'Инициализация и подключение к платформе...'
        }
    }

    if (state === 'waiting') {
        return 'Задача ожидает запуска...'
    }
    if (state === 'active') {
        return 'Анализ в процессе...'
    }
    if (state === 'failed') {
        return 'Задача завершилась с ошибкой'
    }

    return 'Задача в очереди...'
}

function normalizeTaskProgress(rawProgress, state) {
    if (rawProgress && typeof rawProgress === 'object') {
        const value = Number(rawProgress.progress ?? rawProgress.value)
        const progress = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
        const message = String(
            rawProgress.message ||
                rawProgress.currentStep ||
                deriveProgressMessage(progress, state),
        )
        return { progress, message }
    }

    const numeric = Number(rawProgress)
    const progress = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0
    return {
        progress,
        message: deriveProgressMessage(progress, state),
    }
}

function normalizeDateToIso(value) {
    if (value == null || value === '') {
        return new Date().toISOString()
    }

    if (typeof value === 'number') {
        const ts = value < 10000000000 ? value * 1000 : value
        const parsed = new Date(ts)
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString()
        }
        return new Date().toISOString()
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString()
    }

    return new Date().toISOString()
}

function normalizeAnalysisResult(analysis) {
    if (!analysis) {
        return null
    }

    const plain = typeof analysis.toObject === 'function' ? analysis.toObject() : analysis
    const stats = plain.stats || plain.sentiment_stats || {
        total: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        toxic: 0,
    }
    const comments = Array.isArray(plain.comments)
        ? plain.comments.map((comment, index) => {
              const source = comment && typeof comment === 'object' ? comment : {}
              const text = String(
                  source.text ||
                      source.content ||
                      source?.snippet?.topLevelComment?.snippet?.textDisplay ||
                      '',
              ).trim()
              return {
                  ...source,
                  comment_id: String(source.comment_id || `comment-${index}`),
                  author_name: String(source.author_name || 'Unknown'),
                  text,
                  content: text,
                  date: normalizeDateToIso(source.date),
              }
          })
        : []

    const aiSummarySource = plain.aiSummary && typeof plain.aiSummary === 'object'
        ? plain.aiSummary
        : null
    const aiSummary = aiSummarySource
        ? {
              content: String(aiSummarySource.content || '').trim(),
              keyPoints: Array.isArray(aiSummarySource.keyPoints)
                  ? aiSummarySource.keyPoints
                        .map((item) => String(item || '').trim())
                        .filter(Boolean)
                  : [],
          }
        : null
    const normalizedAiSummary =
        aiSummary && (aiSummary.content || aiSummary.keyPoints.length > 0)
            ? aiSummary
            : null

    return {
        ...plain,
        stats,
        sentiment_stats: stats,
        comments,
        aiSummary: normalizedAiSummary,
    }
}

class SocialController {
    async analyzePost(req, res, next) {
        try {
            const { phoneNumber, mode = 'fast' } = req.body
            let normalizedMode = mode
            if (normalizedMode !== 'deep' && normalizedMode !== 'full') {
                normalizedMode = 'fast'
            }
            const targetUrl = req.body.url || req.body.postLink || ''

            const detected = detectPlatformFromTargetUrl(targetUrl)
            if (!detected) {
                throw new ValidationError('Неподдерживаемая ссылка', [
                    {
                        field: 'url',
                        message: 'Поддерживаются только Telegram и YouTube ссылки',
                    },
                ])
            }
            const platform = detected

            const userId = getUserIdFromTokenPayload(req.user)
            if (!userId) {
                throw new UnauthorizedError(
                    'Не удалось определить пользователя по токену',
                )
            }

            const batchSizeCandidate = Number(req.body.batchSize)
            const batchSize = Number.isFinite(batchSizeCandidate)
                ? Math.max(1, batchSizeCandidate)
                : undefined
            const languageCandidate = String(req.body.language || 'ru')
                .toLowerCase()
                .trim()
            const language =
                languageCandidate === 'en' || languageCandidate === 'kk'
                    ? languageCandidate
                    : 'ru'
            const jobPayload = {
                userId,
                platform,
                postLink: targetUrl,
                phoneNumber,
                mode: normalizedMode,
                language,
            }

            if (batchSize) {
                jobPayload.batchSize = batchSize
            }
            if (req.body.videoFileUri) {
                jobPayload.videoFileUri = String(req.body.videoFileUri)
            }
            if (req.body.videoMimeType) {
                jobPayload.videoMimeType = String(req.body.videoMimeType)
            }
            if (req.body.transcript) {
                jobPayload.transcript = String(req.body.transcript)
            }

            const job = await addAnalysisTask(jobPayload)

            return sendSuccess(
                res,
                {
                status: 'processing',
                taskId: String(job.id),
                platform,
                mode: normalizedMode,
                progress: 0,
                message: 'Анализ поставлен в очередь',
                },
                { statusCode: 202 },
            )
        } catch (e) {
            return next(e)
        }
    }

    async getTaskStatus(req, res, next) {
        try {
            const { taskId } = req.params
            const userId = getUserIdFromTokenPayload(req.user)
            if (!userId) {
                throw new UnauthorizedError(
                    'Не удалось определить пользователя по токену',
                )
            }

            const analysis = await Analysis.findOne({
                userId,
                taskId: String(taskId),
            })

            if (analysis) {
                return sendSuccess(res, {
                    status: 'completed',
                    taskId: String(taskId),
                    progress: 100,
                    message: 'Анализ завершен. Результаты готовы.',
                    result: normalizeAnalysisResult(analysis),
                })
            }

            const job = await getAnalysisTaskById(taskId)
            if (!job) {
                throw new NotFoundError('Задача не найдена')
            }

            const state = await job.getState()
            const taskProgress = normalizeTaskProgress(job.progress, state)
            return sendSuccess(res, {
                status: state,
                taskId: String(taskId),
                progress: taskProgress.progress,
                message: taskProgress.message,
            })
        } catch (e) {
            return next(e)
        }
    }

    async getHistory(req, res, next) {
        try {
            const userId = getUserIdFromTokenPayload(req.user)
            if (!userId) {
                throw new UnauthorizedError(
                    'Не удалось определить пользователя по токену',
                )
            }

            const history = await Analysis.find({ userId })
                .sort({ createdAt: -1 })
                .select(
                    'postLink stats createdAt platform executionTime postSummary',
                )
            return sendSuccess(res, history)
        } catch (e) {
            return next(e)
        }
    }

    async getAnalysisById(req, res, next) {
        try {
            const userId = getUserIdFromTokenPayload(req.user)
            if (!userId) {
                throw new UnauthorizedError(
                    'Не удалось определить пользователя по токену',
                )
            }

            const analysis = await Analysis.findOne({
                _id: req.params.id,
                userId,
            })
            if (!analysis) {
                throw new NotFoundError('Анализ не найден')
            }
            return sendSuccess(res, normalizeAnalysisResult(analysis))
        } catch (e) {
            return next(e)
        }
    }
}

export default new SocialController()

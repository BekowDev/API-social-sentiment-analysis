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
            const jobPayload = {
                userId,
                platform,
                postLink: targetUrl,
                phoneNumber,
                mode: normalizedMode,
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
                    result: analysis,
                })
            }

            const job = await getAnalysisTaskById(taskId)
            if (!job) {
                throw new NotFoundError('Задача не найдена')
            }

            const state = await job.getState()
            return sendSuccess(res, {
                status: state,
                taskId: String(taskId),
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
            return sendSuccess(res, analysis)
        } catch (e) {
            return next(e)
        }
    }
}

export default new SocialController()

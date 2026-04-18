import { Worker } from 'bullmq'
import redis from '../config/redis.js'
import Analysis from '../models/Analysis.js'
import SocialFactory from '../services/social/social.factory.js'
import aiService from '../services/ai.service.js'
import { ANALYSIS_QUEUE_NAME } from '../services/queue.service.js'
import { detectPlatformFromTargetUrl } from '../utils/auth-request.util.js'

const ANALYSIS_PROGRESS_STEPS = {
    start: {
        progress: 10,
        message: 'Инициализация и подключение к платформе...',
    },
    commentsFetched: {
        progress: 30,
        message: 'Сбор комментариев и данных о реакциях...',
    },
    geminiStarted: {
        progress: 60,
        message: 'Отправка данных в Gemini AI для анализа тональности...',
    },
    finalizing: {
        progress: 90,
        message: 'Финальная обработка и сохранение результатов...',
    },
}

async function updateJobProgress(job, step) {
    if (!job || !step) {
        return
    }

    if (typeof job.updateProgress === 'function') {
        await job.updateProgress(step)
        return
    }

    if (typeof job.progress === 'function') {
        await job.progress(step)
    }
}

async function runAnalysis(data, job) {
    const userId = data.userId
    const phoneNumber = data.phoneNumber
    const postLink = data.postLink
    const mode = data.mode
    const language = data.language
    const taskId = data.taskId
    const batchSize = Number(data.batchSize) || 50
    const startTime = Date.now()
    const targetUrl = postLink || ''

    const platformNorm = detectPlatformFromTargetUrl(targetUrl)
    if (!platformNorm) {
        throw new Error('Неподдерживаемая ссылка')
    }

    const credentials = {}
    const provider = SocialFactory.getProvider(
        platformNorm,
        credentials,
        targetUrl,
    )
    let normalizedMode = 'fast'
    if (mode === 'deep') {
        normalizedMode = 'deep'
    } else if (mode === 'full') {
        normalizedMode = 'full'
    }

    const [postMedia, commentsPayload, reactions] = await Promise.all([
        provider.getPostMedia(targetUrl, normalizedMode),
        provider.getComments(targetUrl, normalizedMode),
        provider.getPostReactions(targetUrl),
    ])

    const normalized =
        SocialFactory.normalizeCommentsForAnalysis(commentsPayload)
    const comments = normalized.rawComments
    const youtubePostContext = normalized.youtubePostContext
    await updateJobProgress(job, ANALYSIS_PROGRESS_STEPS.commentsFetched)

    let mediaForContext = postMedia
    if (youtubePostContext) {
        const baseText = postMedia.text || ''
        mediaForContext = {
            ...postMedia,
            text: baseText + '\n' + youtubePostContext,
        }
    }
    if (data.videoFileUri) {
        mediaForContext.videoFileUri = String(data.videoFileUri)
    }
    if (data.videoMimeType) {
        mediaForContext.videoMimeType = String(data.videoMimeType)
    }
    if (data.transcript) {
        mediaForContext.transcript = String(data.transcript)
    }

    const postContext = await aiService.getPostContextSummary(mediaForContext)

    await updateJobProgress(job, ANALYSIS_PROGRESS_STEPS.geminiStarted)
    const aiPayload = await aiService.analyzeInBatches(comments, batchSize, {
        contextSummary: postContext,
    })
    const aiResults = Array.isArray(aiPayload?.analyses)
        ? aiPayload.analyses
        : []

    for (let i = 0; i < comments.length; i++) {
        const ai = aiResults[i]
        if (ai != null && typeof ai === 'object') {
            comments[i].analysis = {
                sentiment: ai.sentiment || 'neutral',
                score: typeof ai.score === 'number' ? ai.score : 0.5,
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
    const aiSummary = await aiService.generateInsightsSummary(comments, {
        contextSummary: postContext,
        mode: normalizedMode,
        language,
    })

    const duration = Date.now() - startTime
    await updateJobProgress(job, ANALYSIS_PROGRESS_STEPS.finalizing)

    const analysis = await Analysis.create({
        userId,
        taskId,
        platform: platformNorm,
        postLink: targetUrl,
        phoneNumber,
        stats,
        comments,
        reactions,
        executionTime: duration,
        postSummary: postContext,
        aiSummary,
    })

    return analysis
}

export const analysisWorker = new Worker(
    ANALYSIS_QUEUE_NAME,
    async function processAnalysisJob(job) {
        await updateJobProgress(job, ANALYSIS_PROGRESS_STEPS.start)
        const analysis = await runAnalysis({
            ...job.data,
            taskId: String(job.id),
        }, job)

        return { analysisId: analysis._id }
    },
    { connection: redis },
)

analysisWorker.on('completed', function onCompleted(job) {
    console.log(`Analysis task completed: ${job.id}`)
})

analysisWorker.on('failed', function onFailed(job, error) {
    console.error(`Analysis task failed: ${job?.id}`, error.message)
})

export default analysisWorker

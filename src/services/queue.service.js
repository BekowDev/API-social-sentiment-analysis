import { Queue } from 'bullmq'
import { createHash } from 'node:crypto'
import redis from '../config/redis.js'

export const ANALYSIS_QUEUE_NAME = 'analysis-queue'

const analysisQueue = new Queue(ANALYSIS_QUEUE_NAME, {
    connection: redis,
})

const ANALYSIS_JOB_NAME = 'analyze-post'
const ANALYSIS_JOB_OPTIONS = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 5000,
    },
    removeOnComplete: {
        age: 24 * 60 * 60,
        count: 1000,
    },
    removeOnFail: {
        age: 7 * 24 * 60 * 60,
        count: 2000,
    },
}

function buildAnalysisJobId(jobData = {}) {
    const fingerprintPayload = {
        userId: String(jobData.userId || ''),
        platform: String(jobData.platform || ''),
        postLink: String(jobData.postLink || ''),
        mode: String(jobData.mode || 'fast'),
        language: String(jobData.language || 'ru'),
    }
    const fingerprint = JSON.stringify(fingerprintPayload)
    return createHash('sha1').update(fingerprint).digest('hex')
}

async function findActiveDuplicateAnalysisJob(jobData) {
    const targetFingerprint = buildAnalysisJobId(jobData)
    const jobs = await analysisQueue.getJobs(
        ['waiting', 'active', 'delayed', 'prioritized', 'paused'],
        0,
        200,
        true,
    )

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]
        if (!job || job.name !== ANALYSIS_JOB_NAME) {
            continue
        }

        const currentFingerprint = buildAnalysisJobId(job.data)
        if (currentFingerprint === targetFingerprint) {
            return job
        }
    }

    return null
}

export const addAnalysisTask = async (jobData) => {
    const duplicateJob = await findActiveDuplicateAnalysisJob(jobData)
    if (duplicateJob) {
        return duplicateJob
    }

    return analysisQueue.add(ANALYSIS_JOB_NAME, jobData, ANALYSIS_JOB_OPTIONS)
}

export const getAnalysisTaskById = async (taskId) => {
    return analysisQueue.getJob(taskId)
}

export default analysisQueue

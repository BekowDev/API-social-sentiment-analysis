import { Queue } from 'bullmq';
import redis from '../config/redis.js';

export const ANALYSIS_QUEUE_NAME = 'analysis-queue';

const analysisQueue = new Queue(ANALYSIS_QUEUE_NAME, {
    connection: redis,
});

export const addAnalysisTask = async (jobData) => {
    return analysisQueue.add('analyze-post', jobData);
};

export const getAnalysisTaskById = async (taskId) => {
    return analysisQueue.getJob(taskId);
};

export default analysisQueue;

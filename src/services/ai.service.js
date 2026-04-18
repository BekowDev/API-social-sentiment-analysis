import { GoogleGenerativeAI } from '@google/generative-ai'
import {
    buildCommentsBatchPrompt,
    buildContextSummaryInstruction,
    buildReducePrompt,
} from '../config/prompts.js'
import { config } from '../config/index.js'

const GEMINI_TEXT_MODEL = config.gemeniTextModel
const GEMINI_MAIN_MODEL = config.gemeniModel

const DEFAULT_BATCH_SIZE = 50
const DEFAULT_PARALLEL_BATCHES = 3
const MAX_COMMENTS_FOR_DIRECT_ANALYSIS = 10000
const DEFAULT_SAMPLE_LIMIT = 4000
const DEFAULT_MAX_TOKENS_PER_BATCH = 9000
const AVG_CHARS_PER_TOKEN = 4

class AIService {
    constructor() {
        const apiKey = config.gemeniApiKey
        if (!apiKey) {
            throw new Error(
                'API Key для Gemini не найден: задайте GEMINI_API_KEY в .env',
            )
        }
        this.genAI = new GoogleGenerativeAI(apiKey)
        this.textModel = this.genAI.getGenerativeModel({
            model: GEMINI_TEXT_MODEL,
            generationConfig: { responseMimeType: 'application/json' },
        })
        this.multimodalModel = this.genAI.getGenerativeModel({
            model: GEMINI_MAIN_MODEL,
            generationConfig: { responseMimeType: 'application/json' },
        })
        this.lastAggregateInsight = null
    }

    parseJsonFromModelResponse(rawText) {
        if (!rawText) {
            return null
        }
        try {
            let cleanText = String(rawText)
            cleanText = cleanText.replace(/```json/g, '')
            cleanText = cleanText.replace(/```/g, '')
            cleanText = cleanText.trim()
            return JSON.parse(cleanText)
        } catch (error) {
            return null
        }
    }

    buildVideoPromptParts(postMedia = {}) {
        const promptParts = []
        const postText = postMedia.text || 'Текст контента отсутствует'
        const transcript = postMedia.transcript || ''
        const mode = postMedia.mode || 'fast'
        const hasVideo = Boolean(
            postMedia.videoFileUri || postMedia.videoBuffer,
        )

        const instruction = buildContextSummaryInstruction({
            mode,
            hasTranscript: Boolean(transcript),
            hasVideo,
        })

        promptParts.push({
            text:
                instruction +
                `\n\nТекст поста: "${postText}"` +
                (transcript ? `\nТранскрипт: "${transcript}"` : ''),
        })

        if (postMedia.videoFileUri) {
            promptParts.push({
                fileData: {
                    fileUri: String(postMedia.videoFileUri),
                    mimeType: postMedia.videoMimeType || 'video/mp4',
                },
            })
        } else if (postMedia.videoBuffer) {
            const videoData = Buffer.isBuffer(postMedia.videoBuffer)
                ? postMedia.videoBuffer.toString('base64')
                : String(postMedia.videoBuffer)

            promptParts.push({
                inlineData: {
                    data: videoData,
                    mimeType: postMedia.videoMimeType || 'video/mp4',
                },
            })
        } else if (postMedia.buffer) {
            promptParts.push({
                inlineData: {
                    data: postMedia.buffer,
                    mimeType: postMedia.mimeType,
                },
            })
        }

        return promptParts
    }

    async getPostContextSummary(postMedia = {}) {
        try {
            const hasVideo = Boolean(
                postMedia.videoFileUri || postMedia.videoBuffer,
            )
            const hasImage = Boolean(postMedia.buffer)
            const hasTranscript = Boolean(postMedia.transcript)

            if (!hasVideo && !hasImage && !hasTranscript) {
                return postMedia.text || 'Контекст отсутствует'
            }

            const promptParts = this.buildVideoPromptParts(postMedia)
            const model =
                hasVideo || hasImage ? this.multimodalModel : this.textModel
            const result = await model.generateContent(promptParts)
            const json = this.parseJsonFromModelResponse(result.response.text())

            if (!json) {
                return postMedia.text || 'Описание не получено'
            }

            return json.summary || 'Описание не получено'
        } catch (e) {
            console.error('Context Error:', e.message)
            return postMedia.text || ''
        }
    }

    buildCommentText(commentInput) {
        const raw = String(commentInput || '')
        const re = /\d{1,2}:\d{2}(:\d{2})?/g
        const found = raw.match(re)
        if (!found || found.length === 0) {
            return raw
        }
        return '[Пользователь ссылается на таймкод] ' + raw
    }

    estimateTokens(value) {
        const text = String(value || '')
        return Math.ceil(text.length / AVG_CHARS_PER_TOKEN)
    }

    estimateCommentTokens(comment) {
        const text = this.buildCommentText(comment?.content || '')
        return this.estimateTokens(text) + 12
    }

    truncateCommentForPrompt(text, maxTokens = 700) {
        const safeText = String(text || '')
        const maxChars = maxTokens * AVG_CHARS_PER_TOKEN
        if (safeText.length <= maxChars) {
            return safeText
        }
        return safeText.slice(0, maxChars) + ' ...[truncated]'
    }

    sampleComments(comments, maxLimit = DEFAULT_SAMPLE_LIMIT) {
        const source = Array.isArray(comments) ? comments : []
        if (source.length <= maxLimit) {
            return source
        }

        const scored = source.map((item) => {
            const text = String(item?.comment?.content || '')
            let score = text.length
            if (/[!?]/.test(text)) {
                score += 40
            }
            if (/\d{1,2}:\d{2}(:\d{2})?/.test(text)) {
                score += 35
            }
            if (
                /(hate|ненавиж|туп|идиот|класс|топ|ужас|кринж|toxic|toxic)/i.test(
                    text,
                )
            ) {
                score += 50
            }
            return { item, score }
        })

        scored.sort((a, b) => b.score - a.score)
        const priorityPartSize = Math.floor(maxLimit * 0.7)
        const priority = scored
            .slice(0, priorityPartSize)
            .map((entry) => entry.item)

        const rest = scored.slice(priorityPartSize).map((entry) => entry.item)
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const tmp = rest[i]
            rest[i] = rest[j]
            rest[j] = tmp
        }

        const selected = priority.concat(
            rest.slice(0, maxLimit - priority.length),
        )
        selected.sort((a, b) => a.originIndex - b.originIndex)
        return selected
    }

    buildTokenAwareChunks(comments, batchSize, maxTokensPerBatch) {
        const chunks = []
        let currentChunk = []
        let currentTokens = 0
        const maxItems = Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE)
        const maxTokens = Math.max(
            1000,
            Number(maxTokensPerBatch) || DEFAULT_MAX_TOKENS_PER_BATCH,
        )

        for (let i = 0; i < comments.length; i++) {
            const item = comments[i]
            const itemTokens = this.estimateCommentTokens(item.comment)
            const exceedsTokenLimit =
                currentChunk.length > 0 &&
                currentTokens + itemTokens > maxTokens
            const exceedsSizeLimit = currentChunk.length >= maxItems

            if (exceedsTokenLimit || exceedsSizeLimit) {
                chunks.push(currentChunk)
                currentChunk = []
                currentTokens = 0
            }

            currentChunk.push(item)
            currentTokens += itemTokens
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk)
        }

        return chunks
    }

    getNeutralFallbackResult() {
        return {
            sentiment: 'neutral',
            score: 0.5,
            is_toxic: false,
            is_sarcastic: false,
            emotion: 'neutral',
            themes: [],
            hidden_meaning: '',
            explanation: '',
        }
    }

    buildPartialBatchSummary(analyzedResults, batchItems) {
        const safeResults = Array.isArray(analyzedResults)
            ? analyzedResults
            : []
        const total = safeResults.length
        let positive = 0
        let negative = 0
        let neutral = 0
        let toxic = 0
        const themeCounter = new Map()

        for (let i = 0; i < safeResults.length; i++) {
            const row = safeResults[i] || {}
            if (row.sentiment === 'positive') {
                positive += 1
            } else if (row.sentiment === 'negative') {
                negative += 1
            } else {
                neutral += 1
            }
            if (row.is_toxic === true) {
                toxic += 1
            }

            const themes = Array.isArray(row.themes) ? row.themes : []
            for (let j = 0; j < themes.length; j++) {
                const key = String(themes[j] || '')
                    .trim()
                    .toLowerCase()
                if (!key) {
                    continue
                }
                themeCounter.set(key, (themeCounter.get(key) || 0) + 1)
            }
        }

        const topThemes = Array.from(themeCounter.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map((entry) => entry[0])

        return {
            comments_count: total,
            sample_origin_range: {
                first: batchItems[0]?.originIndex ?? null,
                last: batchItems[batchItems.length - 1]?.originIndex ?? null,
            },
            sentiment: { positive, negative, neutral },
            toxic_comments: toxic,
            top_themes: topThemes,
        }
    }

    async reduceBatchSummaries(partialSummaries, options = {}) {
        if (!Array.isArray(partialSummaries) || partialSummaries.length === 0) {
            return null
        }

        if (partialSummaries.length === 1) {
            return partialSummaries[0]
        }

        const prompt = buildReducePrompt({
            mode: options.mode || 'fast',
            contextSummary: options.contextSummary || '',
            partialAnalysesJson: JSON.stringify(partialSummaries),
            hasTranscript: Boolean(options.hasTranscript),
            hasVideo: Boolean(options.hasVideo),
        })

        try {
            const result = await this.textModel.generateContent(prompt)
            const parsed = this.parseJsonFromModelResponse(
                result.response.text(),
            )
            if (
                parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
            ) {
                return parsed
            }
            return null
        } catch (error) {
            console.error('Reduce summary error:', error.message)
            return null
        }
    }

    normalizeAiResultRow(row) {
        if (!row || typeof row !== 'object') {
            return this.getNeutralFallbackResult()
        }
        return {
            sentiment: row.sentiment || 'neutral',
            score: typeof row.score === 'number' ? row.score : 0.5,
            is_toxic: Boolean(row.is_toxic),
            is_sarcastic: Boolean(row.is_sarcastic),
            emotion: row.emotion || 'neutral',
            themes: Array.isArray(row.themes) ? row.themes : [],
            hidden_meaning: row.hidden_meaning
                ? String(row.hidden_meaning)
                : '',
            explanation: row.explanation ? String(row.explanation) : '',
        }
    }

    async analyzeBatch(commentsBatch, options = {}) {
        const safeBatch = Array.isArray(commentsBatch) ? commentsBatch : []
        if (safeBatch.length === 0) {
            return []
        }

        try {
            let lines = ''
            let localIndex = 1
            for (let i = 0; i < safeBatch.length; i++) {
                const item = safeBatch[i]?.comment || {}
                let text = String(item.content || '').trim()
                if (text.length === 0) {
                    text = '(пустой комментарий)'
                } else {
                    text = this.buildCommentText(text)
                }
                text = this.truncateCommentForPrompt(text)
                lines += String(localIndex) + '. ' + text + '\n'
                localIndex += 1
            }

            const batchCount = safeBatch.length
            const prompt = buildCommentsBatchPrompt({
                mode: options.mode || 'fast',
                contextSummary: options.contextSummary || '',
                lines,
                batchCount,
                batchIndex: options.batchIndex || 0,
                totalBatches: options.totalBatches || 1,
                hasTranscript: Boolean(options.hasTranscript),
                hasVideo: Boolean(options.hasVideo),
            })

            const result = await this.textModel.generateContent(prompt)
            const parsed = this.parseJsonFromModelResponse(
                result.response.text(),
            )

            if (Array.isArray(parsed) && parsed.length > 0) {
                const normalized = []
                for (let i = 0; i < batchCount; i++) {
                    normalized.push(this.normalizeAiResultRow(parsed[i]))
                }
                return normalized
            }

            const fallback = []
            for (let i = 0; i < batchCount; i++) {
                fallback.push(this.getNeutralFallbackResult())
            }
            return fallback
        } catch (e) {
            console.error('Batch analysis error:', e.message)
            const fallback = []
            for (let i = 0; i < safeBatch.length; i++) {
                fallback.push(this.getNeutralFallbackResult())
            }
            return fallback
        }
    }

    async analyzeInBatches(
        comments,
        batchSize = DEFAULT_BATCH_SIZE,
        options = {},
    ) {
        const source = Array.isArray(comments) ? comments : []
        if (source.length === 0) {
            return []
        }

        const contextSummary = options.contextSummary || ''
        const mode = options.mode || 'fast'
        const hasTranscript = Boolean(options.hasTranscript)
        const hasVideo = Boolean(options.hasVideo)

        let normalizedBatchSize = Number(batchSize) || DEFAULT_BATCH_SIZE
        if (normalizedBatchSize < 1) {
            normalizedBatchSize = DEFAULT_BATCH_SIZE
        }

        const parallelLimit = Math.max(
            1,
            Number(options.parallelLimit) || DEFAULT_PARALLEL_BATCHES,
        )
        const maxTokensPerBatch = Math.max(
            1000,
            Number(options.maxTokensPerBatch) || DEFAULT_MAX_TOKENS_PER_BATCH,
        )
        const sampleLimit = Math.max(
            100,
            Number(options.sampleLimit) || DEFAULT_SAMPLE_LIMIT,
        )

        const withIndex = source.map((comment, index) => ({
            comment,
            originIndex: index,
        }))

        let selected = withIndex
        if (withIndex.length > MAX_COMMENTS_FOR_DIRECT_ANALYSIS) {
            selected = this.sampleComments(withIndex, sampleLimit)
        }

        const chunks = this.buildTokenAwareChunks(
            selected,
            normalizedBatchSize,
            maxTokensPerBatch,
        )

        const chunkResults = new Array(chunks.length)
        const partialSummaries = new Array(chunks.length)
        let chunkCursor = 0
        const workerCount = Math.min(parallelLimit, chunks.length)

        await Promise.all(
            Array.from({ length: workerCount }, async () => {
                while (true) {
                    const index = chunkCursor
                    chunkCursor += 1
                    if (index >= chunks.length) {
                        break
                    }

                    chunkResults[index] = await this.analyzeBatch(
                        chunks[index],
                        {
                            mode,
                            contextSummary,
                            batchIndex: index,
                            totalBatches: chunks.length,
                            hasTranscript,
                            hasVideo,
                        },
                    )
                    partialSummaries[index] = this.buildPartialBatchSummary(
                        chunkResults[index],
                        chunks[index],
                    )
                }
            }),
        )

        const finalResults = Array.from({ length: source.length }, () =>
            this.getNeutralFallbackResult(),
        )
        for (let i = 0; i < chunks.length; i++) {
            const batchItems = chunks[i]
            const batchAiRows = Array.isArray(chunkResults[i])
                ? chunkResults[i]
                : []
            for (let j = 0; j < batchItems.length; j++) {
                const originIndex = batchItems[j].originIndex
                const row = this.normalizeAiResultRow(batchAiRows[j])
                finalResults[originIndex] = row
            }
        }

        this.lastAggregateInsight = await this.reduceBatchSummaries(
            partialSummaries.filter(Boolean),
            { mode, contextSummary, hasTranscript, hasVideo },
        )

        return finalResults
    }

    async analyzeComments(commentsList, contextSummary, options = {}) {
        try {
            return await this.analyzeInBatches(
                commentsList,
                DEFAULT_BATCH_SIZE,
                {
                    contextSummary,
                    mode: options.mode || 'fast',
                    hasTranscript: Boolean(options.hasTranscript),
                    hasVideo: Boolean(options.hasVideo),
                },
            )
        } catch (e) {
            console.error('Analysis Error:', e.message)
            return []
        }
    }
}

export default new AIService()

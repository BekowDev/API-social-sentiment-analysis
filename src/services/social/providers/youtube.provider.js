import BaseSocialProvider from '../base.provider.js'
import axios from 'axios'
import proxyManager from '../../../shared/proxy.manager.js'
import { normalizeDateToIsoOrNull } from '../../../utils/date.util.js'

/**
 * Достаёт id ролика из обычной ссылки YouTube.
 * Поддерживаются:
 * - youtube.com/watch?v=...
 * - youtu.be/...
 * - youtube.com/shorts/...
 * - youtube.com/live/...
 * - youtube.com/embed/...
 */
function normalizeYouTubeLink(urlString) {
    const raw = String(urlString || '').trim()
    if (!raw) {
        return ''
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return raw
    }
    if (
        raw.startsWith('youtube.com/') ||
        raw.startsWith('www.youtube.com/') ||
        raw.startsWith('m.youtube.com/') ||
        raw.startsWith('youtu.be/') ||
        raw.startsWith('www.youtu.be/')
    ) {
        return `https://${raw}`
    }
    return raw
}

function normalizeCandidateId(value) {
    const candidate = String(value || '').trim()
    if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) {
        return candidate
    }
    return null
}

function extractVideoIdFromUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') {
        return null
    }

    const normalized = normalizeYouTubeLink(urlString)

    try {
        const parsed = new URL(normalized)
        const host = String(parsed.hostname || '').toLowerCase()
        const pathSegments = parsed.pathname
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean)

        const isYouTubeHost =
            host === 'youtube.com' ||
            host === 'www.youtube.com' ||
            host === 'm.youtube.com'
        const isShortHost = host === 'youtu.be' || host === 'www.youtu.be'

        if (isShortHost) {
            return normalizeCandidateId(pathSegments[0])
        }

        if (isYouTubeHost) {
            const watchId = normalizeCandidateId(parsed.searchParams.get('v'))
            if (watchId) {
                return watchId
            }

            const first = pathSegments[0]
            const second = pathSegments[1]
            if (
                (first === 'shorts' || first === 'live' || first === 'embed') &&
                second
            ) {
                return normalizeCandidateId(second)
            }
        }
    } catch (error) {
        // fallback to regex-based parse below
    }

    const patterns = [
        /(?:youtube\.com\/watch\?[^#\n]*\bv=)([A-Za-z0-9_-]{11})/i,
        /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/i,
        /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/i,
        /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/i,
        /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/i,
    ]

    for (let i = 0; i < patterns.length; i++) {
        const match = normalized.match(patterns[i])
        if (match && match[1]) {
            return normalizeCandidateId(match[1])
        }
    }

    return null
}

function createProviderConfigError(message) {
    const error = new Error(message)
    error.code = 'PROVIDER_CONFIG_ERROR'
    return error
}

function createProviderInputError(message) {
    const error = new Error(message)
    error.code = 'PROVIDER_INPUT_ERROR'
    return error
}

function isApiKeyRejected(status, errorText) {
    const normalizedText = String(errorText || '').toLowerCase()
    const isAuthStatus = status === 400 || status === 401 || status === 403
    return (
        isAuthStatus &&
        (normalizedText.includes('api key') ||
            normalizedText.includes('key') ||
            normalizedText.includes('credential') ||
            normalizedText.includes('access not configured'))
    )
}

class YouTubeProvider extends BaseSocialProvider {
    static platform = 'youtube'

    static canHandleUrl(url) {
        const target = String(url || '').toLowerCase()
        return (
            target.indexOf('youtube.com') !== -1 ||
            target.indexOf('youtu.be') !== -1
        )
    }

    constructor(credentials = {}) {
        super(credentials)
    }

    async requestJson(url) {
        try {
            const response = await axios.get(
                url,
                proxyManager.buildAxiosConfig({ timeout: 25000 }),
            )

            return {
                ok: true,
                status: response.status,
                data: response.data,
                errorText: '',
            }
        } catch (error) {
            return {
                ok: false,
                status: error?.response?.status || 500,
                data: null,
                errorText:
                    error?.response?.data?.error?.message ||
                    error?.response?.data?.message ||
                    error?.message ||
                    'Request failed',
            }
        }
    }

    async fetchVideoDetails(videoId, apiKey) {
        const params = new URLSearchParams()
        params.set('part', 'snippet,statistics')
        params.set('id', videoId)
        params.set('key', apiKey)

        const requestUrl =
            'https://www.googleapis.com/youtube/v3/videos?' + params.toString()

        const response = await this.requestJson(requestUrl)
        if (!response.ok) {
            if (isApiKeyRejected(response.status, response.errorText)) {
                throw createProviderConfigError(
                    'Некорректный YOUTUBE_API_KEY или доступ к YouTube Data API не настроен',
                )
            }
            console.error(
                'YouTube videos.list ошибка:',
                response.status,
                String(response.errorText || '').slice(0, 200),
            )
            return {
                title: '',
                description: '',
                likeCount: '',
                viewCount: '',
            }
        }

        const data = response.data
        if (!data.items || data.items.length === 0) {
            return {
                title: '',
                description: '',
                likeCount: '',
                viewCount: '',
            }
        }

        const video = data.items[0]
        const snippet = video.snippet
        if (!snippet) {
            return {
                title: '',
                description: '',
                likeCount: '',
                viewCount: '',
            }
        }

        const title = snippet.title ? String(snippet.title) : ''
        const description = snippet.description
            ? String(snippet.description).trim()
            : ''
        let likeCount = ''
        let viewCount = ''
        if (video.statistics) {
            if (video.statistics.likeCount) {
                likeCount = String(video.statistics.likeCount)
            }
            if (video.statistics.viewCount) {
                viewCount = String(video.statistics.viewCount)
            }
        }

        return { title, description, likeCount, viewCount }
    }

    async fetchTranscript(videoId) {
        const langList = ['ru', 'en', 'uk']
        for (let i = 0; i < langList.length; i++) {
            const lang = langList[i]
            const params = new URLSearchParams()
            params.set('v', videoId)
            params.set('lang', lang)
            params.set('fmt', 'json3')
            const transcriptUrl =
                'https://www.youtube.com/api/timedtext?' + params.toString()

            try {
                const response = await this.requestJson(transcriptUrl)
                if (!response.ok) {
                    continue
                }
                const data = response.data
                if (!data || !Array.isArray(data.events)) {
                    continue
                }

                let transcript = ''
                for (let j = 0; j < data.events.length; j++) {
                    const event = data.events[j]
                    if (!event || !Array.isArray(event.segs)) {
                        continue
                    }
                    for (let k = 0; k < event.segs.length; k++) {
                        const seg = event.segs[k]
                        if (!seg || !seg.utf8) {
                            continue
                        }
                        const piece = String(seg.utf8)
                            .replace(/\s+/g, ' ')
                            .trim()
                        if (piece.length === 0) {
                            continue
                        }
                        if (transcript.length > 0) {
                            transcript += ' '
                        }
                        transcript += piece
                    }
                }

                if (transcript.length > 0) {
                    return transcript
                }
            } catch (e) {
                console.error(
                    'YouTube: ошибка загрузки транскрипта (' + lang + '):',
                    e.message,
                )
            }
        }

        return ''
    }

    async fetchRepliesByParent(parentId, apiKey) {
        const replies = []
        let pageToken = ''

        while (true) {
            const params = new URLSearchParams()
            params.set('part', 'snippet')
            params.set('parentId', parentId)
            params.set('maxResults', '100')
            params.set('key', apiKey)
            if (pageToken) {
                params.set('pageToken', pageToken)
            }
            const requestUrl =
                'https://www.googleapis.com/youtube/v3/comments?' +
                params.toString()

            const response = await this.requestJson(requestUrl)
            if (!response.ok) {
                break
            }
            const data = response.data
            if (
                !data ||
                !Array.isArray(data.items) ||
                data.items.length === 0
            ) {
                break
            }

            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i]
                if (item && item.snippet) {
                    replies.push(item)
                }
            }

            if (!data.nextPageToken) {
                break
            }
            pageToken = data.nextPageToken
        }

        return replies
    }

    /**
     * @param {string} url - ссылка на видео
     * @param {string|number} modeOrLimit - как в базе: 'fast' / 'deep' или число лимита
     */
    async getComments(url, modeOrLimit = 'fast') {
        let limit = 50
        let mode = 'fast'
        if (modeOrLimit === 'deep') {
            limit = 100
            mode = 'deep'
        } else if (modeOrLimit === 'full') {
            limit = 100
            mode = 'full'
        } else if (typeof modeOrLimit === 'number' && modeOrLimit > 0) {
            limit = modeOrLimit
        }
        if (limit > 100) {
            limit = 100
        }
        if (limit < 1) {
            limit = 1
        }

        const videoId = extractVideoIdFromUrl(url)
        if (!videoId) {
            throw createProviderInputError(
                'Не удалось извлечь videoId из YouTube ссылки. Используйте ссылку на конкретное видео',
            )
        }

        const apiKey = process.env.YOUTUBE_API_KEY
        if (!apiKey) {
            throw createProviderConfigError(
                'YouTube: в .env не задан YOUTUBE_API_KEY',
            )
        }

        let title = ''
        let description = ''
        let likeCount = ''
        let viewCount = ''
        try {
            const details = await this.fetchVideoDetails(videoId, apiKey)
            title = details.title
            description = details.description
            likeCount = details.likeCount
            viewCount = details.viewCount
        } catch (e) {
            console.error(
                'YouTube: не удалось загрузить описание видео:',
                e.message,
            )
        }

        const basicPostContext =
            'Название видео: ' + title + '. Описание: ' + description + '.'

        try {
            const includeReplies = mode === 'full'
            const threadItems = []
            let pageToken = ''

            while (threadItems.length < limit) {
                const params = new URLSearchParams()
                if (includeReplies) {
                    params.set('part', 'snippet,replies')
                } else {
                    params.set('part', 'snippet')
                }
                params.set('videoId', videoId)
                params.set('maxResults', String(limit))
                params.set('key', apiKey)
                if (pageToken) {
                    params.set('pageToken', pageToken)
                }

                const requestUrl =
                    'https://www.googleapis.com/youtube/v3/commentThreads?' +
                    params.toString()

                const response = await this.requestJson(requestUrl)
                if (!response.ok) {
                    if (isApiKeyRejected(response.status, response.errorText)) {
                        throw createProviderConfigError(
                            'YouTube API отклонил ключ доступа (YOUTUBE_API_KEY)',
                        )
                    }
                    console.error(
                        'YouTube API ошибка:',
                        response.status,
                        String(response.errorText || '').slice(0, 200),
                    )
                    break
                }

                const data = response.data
                if (
                    !data ||
                    !Array.isArray(data.items) ||
                    data.items.length === 0
                ) {
                    break
                }

                for (let i = 0; i < data.items.length; i++) {
                    if (threadItems.length >= limit) {
                        break
                    }
                    threadItems.push(data.items[i])
                }

                if (!data.nextPageToken) {
                    break
                }
                pageToken = data.nextPageToken
            }

            const basicComments = []
            const fullComments = []
            const threadLines = []

            if (threadItems.length > 0) {
                for (let i = 0; i < threadItems.length; i++) {
                    const item = threadItems[i]
                    const snippetItem = item.snippet
                    if (!snippetItem || !snippetItem.topLevelComment) {
                        continue
                    }
                    const topLevelComment = snippetItem.topLevelComment
                    const top = topLevelComment.snippet
                    if (!top) {
                        continue
                    }
                    let text = top.textOriginal
                    if (!text) {
                        text = top.textDisplay || ''
                    }
                    const rootText = text ? String(text).trim() : ''
                    if (rootText.length === 0) {
                        continue
                    }

                    let rootAuthor = 'YouTube'
                    if (top.authorDisplayName) {
                        rootAuthor = String(top.authorDisplayName)
                    }
                    const rootCommentId = topLevelComment.id
                        ? String(topLevelComment.id)
                        : 'yt-root-' + i

                    const mappedComment = {
                        comment_id: rootCommentId,
                        author_name: rootAuthor,
                        content: rootText,
                        date: normalizeDateToIsoOrNull(
                            top.publishedAt || snippetItem.publishedAt,
                        ),
                        thread: {
                            threadId: item.id ? String(item.id) : '',
                            parentId: null,
                            depth: 0,
                        },
                    }

                    if (!includeReplies) {
                        basicComments.push(mappedComment)
                        continue
                    }

                    fullComments.push(mappedComment)
                    threadLines.push(
                        'Тред #' +
                            String(i + 1) +
                            ' | ROOT [' +
                            rootAuthor +
                            ']: ' +
                            rootText,
                    )

                    let replyItems = []
                    if (
                        item.replies &&
                        Array.isArray(item.replies.comments) &&
                        item.replies.comments.length > 0
                    ) {
                        for (let j = 0; j < item.replies.comments.length; j++) {
                            replyItems.push(item.replies.comments[j])
                        }
                    }

                    let totalReplyCount = 0
                    if (typeof snippetItem.totalReplyCount === 'number') {
                        totalReplyCount = snippetItem.totalReplyCount
                    }
                    if (totalReplyCount > replyItems.length) {
                        const extraReplies = await this.fetchRepliesByParent(
                            rootCommentId,
                            apiKey,
                        )
                        for (let j = 0; j < extraReplies.length; j++) {
                            const extra = extraReplies[j]
                            let exists = false
                            for (let k = 0; k < replyItems.length; k++) {
                                if (
                                    replyItems[k] &&
                                    replyItems[k].id === extra.id
                                ) {
                                    exists = true
                                    break
                                }
                            }
                            if (!exists) {
                                replyItems.push(extra)
                            }
                        }
                    }

                    for (let j = 0; j < replyItems.length; j++) {
                        const replyItem = replyItems[j]
                        if (!replyItem || !replyItem.snippet) {
                            continue
                        }
                        const replySnippet = replyItem.snippet
                        let replyText = replySnippet.textOriginal
                        if (!replyText) {
                            replyText = replySnippet.textDisplay || ''
                        }
                        replyText = String(replyText).trim()
                        if (replyText.length === 0) {
                            continue
                        }
                        let replyAuthor = 'YouTube'
                        if (replySnippet.authorDisplayName) {
                            replyAuthor = String(replySnippet.authorDisplayName)
                        }
                        const replyCommentId = replyItem.id
                            ? String(replyItem.id)
                            : rootCommentId + '-r-' + j

                        const mappedComment = {
                            comment_id: replyCommentId,
                            author_name: replyAuthor,
                            content: replyText,
                            date: normalizeDateToIsoOrNull(
                                replySnippet.publishedAt,
                            ),
                            thread: {
                                threadId: item.id ? String(item.id) : '',
                                parentId: rootCommentId,
                                depth: 1,
                            },
                        }
                        fullComments.push(mappedComment)
                        threadLines.push(
                            'Тред #' +
                                String(i + 1) +
                                ' | REPLY [' +
                                replyAuthor +
                                '] -> ' +
                                replyText,
                        )
                    }
                }
            }

            if (includeReplies) {
                const transcript = await this.fetchTranscript(videoId)
                let fullContext =
                    'РЕЖИМ FULL.\n' +
                    'Название видео: ' +
                    title +
                    '\n' +
                    'Описание: ' +
                    description +
                    '\n' +
                    'Просмотры: ' +
                    (viewCount || 'нет данных') +
                    '\n' +
                    'Лайки: ' +
                    (likeCount || 'нет данных') +
                    '\n'

                if (threadLines.length > 0) {
                    fullContext += '\nСтруктура диалогов:\n'
                    for (let i = 0; i < threadLines.length; i++) {
                        fullContext += threadLines[i] + '\n'
                    }
                }

                if (transcript && transcript.length > 0) {
                    fullContext += '\nТранскрипт видео:\n' + transcript
                } else {
                    fullContext += '\nТранскрипт видео: недоступен'
                }

                return {
                    postContext: fullContext,
                    comments: fullComments,
                }
            }

            return {
                postContext: basicPostContext,
                comments: basicComments,
            }
        } catch (e) {
            if (e && e.code === 'PROVIDER_CONFIG_ERROR') {
                throw e
            }
            console.error(
                'YouTube: не удалось загрузить комментарии:',
                e.message,
            )
            return {
                postContext: basicPostContext,
                comments: [],
            }
        }
    }

    async getPostMedia(postLink, mode = 'fast') {
        let text =
            'YouTube: контент страницы видео (только комментарии к ролику).'
        if (mode === 'full') {
            text =
                'YouTube: полный контекст ролика и комментариев будет добавлен в contextSummary.'
        }
        return {
            buffer: null,
            mimeType: null,
            text: text,
        }
    }

    async getPostReactions() {
        return []
    }
}

export default YouTubeProvider

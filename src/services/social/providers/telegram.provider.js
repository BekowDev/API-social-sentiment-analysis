import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { config } from '../../../config/index.js'
import BaseSocialProvider from '../base.provider.js'
import proxyManager from '../../../shared/proxy.manager.js'

let sharedClient = null
let isConnecting = false
const sessionClientPool = new Map()

function extractLinksFromText(text) {
    const links = []
    if (!text || typeof text !== 'string') {
        return links
    }

    const linkRegex = /https?:\/\/[^\s]+/g
    const found = text.match(linkRegex)
    if (!found || found.length === 0) {
        return links
    }

    for (let i = 0; i < found.length; i++) {
        links.push(String(found[i]))
    }

    return links
}

function getAuthorName(msg) {
    let authorName = 'User'
    if (msg.sender) {
        if (msg.sender.firstName) {
            authorName = `${msg.sender.firstName} ${msg.sender.lastName || ''}`.trim()
        } else if (msg.sender.username) {
            authorName = msg.sender.username
        }
    }
    return authorName
}

function getValidTelegramCommentText(message) {
    if (!message || typeof message !== 'object') {
        return ''
    }
    if (typeof message.message !== 'string') {
        return ''
    }
    const text = message.message.trim()
    return text.length > 0 ? text : ''
}

function normalizeTelegramLink(rawLink) {
    const raw = String(rawLink || '').trim()
    if (!raw) {
        return ''
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return raw
    }
    if (raw.startsWith('t.me/') || raw.startsWith('telegram.me/')) {
        return `https://${raw}`
    }
    return raw
}

function parseTelegramPostLink(postLink) {
    const normalizedLink = normalizeTelegramLink(postLink)
    let parsedUrl = null
    try {
        parsedUrl = new URL(normalizedLink)
    } catch (error) {
        throw new Error('Невалидная ссылка Telegram')
    }

    const hostname = String(parsedUrl.hostname || '').toLowerCase()
    const isTelegramHost =
        hostname === 't.me' ||
        hostname === 'www.t.me' ||
        hostname === 'telegram.me' ||
        hostname === 'www.telegram.me'
    if (!isTelegramHost) {
        throw new Error('Ссылка не относится к Telegram')
    }

    const parts = parsedUrl.pathname
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)

    if (parts.length < 2) {
        throw new Error('В ссылке отсутствует ID поста')
    }

    let channelRef = ''
    let postIdRaw = ''

    if (parts[0] === 's' && parts.length >= 3) {
        channelRef = parts[1]
        postIdRaw = parts[2]
    } else if (parts[0] === 'c' && parts.length >= 3) {
        const internalChannelId = parts[1]
        if (!/^\d+$/.test(internalChannelId)) {
            throw new Error('Некорректный internal channel ID в ссылке')
        }
        channelRef = `-100${internalChannelId}`
        postIdRaw = parts[2]
    } else {
        channelRef = parts[0]
        postIdRaw = parts[1]
    }

    const postId = Number.parseInt(postIdRaw, 10)
    if (!Number.isInteger(postId) || postId <= 0) {
        throw new Error('Некорректный ID поста в Telegram ссылке')
    }

    const entity =
        typeof channelRef === 'string' &&
        channelRef.length > 0 &&
        !channelRef.startsWith('-')
            ? `@${channelRef}`
            : channelRef

    return { entity, postId }
}

function createProviderConfigError(message) {
    const error = new Error(message)
    error.code = 'PROVIDER_CONFIG_ERROR'
    return error
}

class TelegramProvider extends BaseSocialProvider {
    static platform = 'telegram'

    static canHandleUrl(url) {
        try {
            parseTelegramPostLink(url)
            return true
        } catch (error) {
            return false
        }
    }

    constructor(credentials = {}) {
        super(credentials)
        this.apiId = config.telegram.apiId
        this.apiHash = config.telegram.apiHash
        this.client = null
    }

    getServerSessionString() {
        const raw = config.telegram.serverSession
        if (!raw || String(raw).trim().length === 0) {
            throw createProviderConfigError(
                'Не задан TELEGRAM_SERVER_SESSION для серверного Telegram-аккаунта',
            )
        }
        return String(raw).trim()
    }

    validateTelegramConfig() {
        if (!Number.isInteger(this.apiId) || this.apiId <= 0) {
            throw createProviderConfigError(
                'Некорректный TELEGRAM_API_ID: укажите положительное целое число',
            )
        }

        if (!this.apiHash || String(this.apiHash).trim().length === 0) {
            throw createProviderConfigError('Не задан TELEGRAM_API_HASH')
        }
    }

    async connect() {
        this.validateTelegramConfig()
        const sessionStr = this.getServerSessionString()

        if (sharedClient && sharedClient.connected) {
            this.client = sharedClient
            return
        }

        const pooledClient = sessionClientPool.get(sessionStr)
        if (pooledClient && pooledClient.connected) {
            sharedClient = pooledClient
            this.client = pooledClient
            return
        }

        while (isConnecting) {
            await new Promise(function resolveAfterWait(resolve) {
                setTimeout(resolve, 100)
            })
        }

        if (sharedClient && sharedClient.connected) {
            this.client = sharedClient
            return
        }

        isConnecting = true
        console.log('Telegram: Подключение...')
        try {
            const proxyConfig = proxyManager.buildTelegramProxyConfig()
            sharedClient = new TelegramClient(
                new StringSession(sessionStr),
                this.apiId,
                this.apiHash,
                {
                    connectionRetries: 5,
                    useWSS: false,
                    deviceModel: 'SocialAnalyzer_Pro',
                    proxy: proxyConfig || undefined,
                },
            )
            await sharedClient.connect()
            this.client = sharedClient
            sessionClientPool.set(sessionStr, sharedClient)
        } finally {
            isConnecting = false
        }
    }

    getMessageMediaType(message) {
        if (!message || !message.media) {
            return null
        }

        const media = message.media
        if (media.className === 'MessageMediaPhoto') {
            return {
                mediaKind: 'photo',
                mimeType: 'image/jpeg',
            }
        }

        if (media.className === 'MessageMediaDocument' && media.document) {
            const document = media.document
            let mediaKind = 'document'
            let mimeType = 'application/octet-stream'
            if (document.mimeType) {
                mimeType = String(document.mimeType)
            }

            if (Array.isArray(document.attributes)) {
                for (let i = 0; i < document.attributes.length; i++) {
                    const attr = document.attributes[i]
                    if (!attr || !attr.className) {
                        continue
                    }
                    if (attr.className === 'DocumentAttributeAnimated') {
                        mediaKind = 'gif'
                        if (!document.mimeType) {
                            mimeType = 'image/gif'
                        }
                    } else if (attr.className === 'DocumentAttributeVideo') {
                        if (attr.roundMessage === true) {
                            mediaKind = 'video_note'
                        } else {
                            mediaKind = 'video'
                        }
                        if (!document.mimeType) {
                            mimeType = 'video/mp4'
                        }
                    } else if (attr.className === 'DocumentAttributeAudio') {
                        if (attr.voice === true) {
                            mediaKind = 'voice'
                            if (!document.mimeType) {
                                mimeType = 'audio/ogg'
                            }
                        } else {
                            mediaKind = 'audio'
                        }
                    }
                }
            }

            return {
                mediaKind: mediaKind,
                mimeType: mimeType,
            }
        }

        return {
            mediaKind: 'unknown',
            mimeType: 'application/octet-stream',
        }
    }

    async buildMediaAttachments(message, includeBinary) {
        const attachments = []
        if (!message) {
            return attachments
        }

        const text = message.message ? String(message.message) : ''
        const links = extractLinksFromText(text)
        for (let i = 0; i < links.length; i++) {
            attachments.push({
                mediaKind: 'link',
                mimeType: 'text/uri-list',
                url: links[i],
                buffer: null,
            })
        }

        const mediaInfo = this.getMessageMediaType(message)
        if (!mediaInfo) {
            return attachments
        }

        let dataBase64 = null
        if (includeBinary === true && this.client && message.media) {
            try {
                const downloaded = await this.client.downloadMedia(message.media)
                if (downloaded && downloaded.length) {
                    dataBase64 = downloaded.toString('base64')
                }
            } catch (e) {
                console.error('Ошибка скачивания медиа сообщения:', e.message)
            }
        }

        attachments.push({
            mediaKind: mediaInfo.mediaKind,
            mimeType: mediaInfo.mimeType,
            buffer: dataBase64,
            url: null,
        })

        return attachments
    }

    async getComments(postLink, mode = 'fast') {
        await this.connect()
        try {
            const parsedLink = parseTelegramPostLink(postLink)
            const postId = parsedLink.postId
            const channelName = parsedLink.entity
            const commentsLimit = mode === 'fast' ? 100 : undefined

            // Получаем сам пост
            const messages = await this.client.getMessages(channelName, {
                ids: [postId],
            })
            const post = messages[0]

            if (!post || !post.id) {
                return []
            }

            // 👇 ИЗМЕНЕНИЕ ЗДЕСЬ 👇
            const commentsParams = {
                replyTo: post.id,
                limit: commentsLimit,
            }
            if (mode === 'deep') {
                console.log('Скачиваю все комментарии (mode=deep)...')
            } else if (mode === 'full') {
                console.log('Скачиваю все комментарии и медиа (mode=full)...')
            } else {
                console.log('Скачиваю до 100 комментариев (mode=fast)...')
            }
            const result = await this.client.getMessages(
                channelName,
                commentsParams,
            )
            console.log(`Получено ${result.length} комментариев`)

            const comments = []
            for (let i = 0; i < result.length; i++) {
                const msg = result[i]
                const commentText = getValidTelegramCommentText(msg)
                if (!commentText) {
                    continue
                }
                const oneComment = {
                    comment_id: msg.id,
                    author_name: getAuthorName(msg),
                    content: commentText,
                    date: msg.date,
                }
                if (mode === 'full') {
                    const attachments = await this.buildMediaAttachments(msg, true)
                    oneComment.media = attachments
                }
                comments.push(oneComment)
            }

            return comments
        } catch (e) {
            console.error('Ошибка получения комментариев:', e)
            return []
        }
    }
    async getPostReactions(postLink) {
        await this.connect()
        try {
            const parsedLink = parseTelegramPostLink(postLink)
            const postId = parsedLink.postId
            const channelName = parsedLink.entity
            const result = await this.client.getMessages(channelName, {
                ids: [postId],
            })
            const post = result[0]

            if (!post || !post.reactions || !post.reactions.results) {
                return []
            }

            const reactions = []
            for (let i = 0; i < post.reactions.results.length; i++) {
                const r = post.reactions.results[i]
                let emoji = 'Дефолт'
                if (r.reaction.className === 'ReactionEmoji') {
                    emoji = r.reaction.emoticon
                } else if (r.reaction.className === 'ReactionCustomEmoji') {
                    emoji = 'Кастомный эмодзи'
                }
                reactions.push({
                    emoji: emoji,
                    count: r.count,
                })
            }
            return reactions
        } catch (e) {
            console.error('Ошибка получения реакций:', e)
            return []
        }
    }
    async getPostMedia(postLink, mode = 'fast') {
        await this.connect()
        try {
            const parsedLink = parseTelegramPostLink(postLink)
            const postId = parsedLink.postId
            const channelName = parsedLink.entity
            const messages = await this.client.getMessages(channelName, {
                ids: [postId],
            })
            const post = messages[0]

            if (!post) return { text: '' }

            let buffer = null
            let mimeType = null
            let mediaAttachments = []

            if (post.media) {
                buffer = await this.client.downloadMedia(post.media, {
                    thumb: 1,
                })

                if (!buffer || buffer.length === 0)
                    buffer = await this.client.downloadMedia(post.media)

                if (post.media.className === 'MessageMediaPhoto')
                    mimeType = 'image/jpeg'
                else mimeType = 'image/jpeg'
            }

            if (mode === 'full') {
                mediaAttachments = await this.buildMediaAttachments(post, true)
                if ((!buffer || !mimeType) && mediaAttachments.length > 0) {
                    for (let i = 0; i < mediaAttachments.length; i++) {
                        const item = mediaAttachments[i]
                        if (item && item.buffer && item.mimeType) {
                            buffer = Buffer.from(item.buffer, 'base64')
                            mimeType = item.mimeType
                            break
                        }
                    }
                }
            }
            return {
                buffer: buffer ? buffer.toString('base64') : null,
                mimeType: mimeType,
                text: post.message || '',
                mediaAttachments: mediaAttachments,
            }
        } catch (e) {
            console.error('Ошибка получения медиа:', e)
            return { text: '' }
        }
    }
}

export default TelegramProvider

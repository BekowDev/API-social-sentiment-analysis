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

class TelegramProvider extends BaseSocialProvider {
    static platform = 'telegram'

    static canHandleUrl(url) {
        return String(url || '').toLowerCase().indexOf('t.me') !== -1
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
            throw new Error(
                'Не задан TELEGRAM_SERVER_SESSION для серверного Telegram-аккаунта',
            )
        }
        return String(raw).trim()
    }

    async connect() {
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
            const parts = postLink.split('/')
            const postId = parseInt(parts[parts.length - 1])
            const channelName = parts[parts.length - 2]
            const commentsLimit = mode === 'fast' ? 100 : undefined

            // Получаем сам пост
            const messages = await this.client.getMessages(channelName, {
                ids: [postId],
            })
            const post = messages[0]

            if (!post || !post.replies) return []

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
                const oneComment = {
                    comment_id: msg.id,
                    author_name: getAuthorName(msg),
                    content: msg.message,
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
            const parts = postLink.split('/')
            const postId = parseInt(parts[parts.length - 1])
            const channelName = parts[parts.length - 2]
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
            const parts = postLink.split('/')
            const postId = parseInt(parts[parts.length - 1])
            const channelName = parts[parts.length - 2]
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

import { readdir } from 'node:fs/promises'
import BaseSocialProvider from './base.provider.js'

const PROVIDER_REGISTRY = new Map()
const PROVIDERS_DIR_URL = new URL('./providers/', import.meta.url)

function detectPlatformFromFilename(filename) {
    return String(filename)
        .replace('.provider.js', '')
        .replace('.js', '')
        .trim()
        .toLowerCase()
}

async function loadProviders() {
    const files = await readdir(PROVIDERS_DIR_URL)
    const providerFiles = files.filter((file) => file.endsWith('.provider.js'))

    for (let i = 0; i < providerFiles.length; i++) {
        const file = providerFiles[i]
        const moduleUrl = new URL(`./providers/${file}`, import.meta.url)
        const imported = await import(moduleUrl.href)
        const ProviderClass = imported.default

        if (typeof ProviderClass !== 'function') {
            continue
        }

        const platformByClass = String(ProviderClass.platform || '')
            .toLowerCase()
            .trim()
        const platform =
            platformByClass.length > 0
                ? platformByClass
                : detectPlatformFromFilename(file)

        if (!platform) {
            continue
        }

        PROVIDER_REGISTRY.set(platform, ProviderClass)
    }
}

await loadProviders()

class SocialFactory {
    static getAvailablePlatforms() {
        return Array.from(PROVIDER_REGISTRY.keys())
    }

    static detectProviderClassByLink(postLink = '') {
        const targetLink = String(postLink || '').toLowerCase()
        if (!targetLink) {
            return null
        }

        const providers = Array.from(PROVIDER_REGISTRY.values())
        for (let i = 0; i < providers.length; i++) {
            const ProviderClass = providers[i]
            if (
                ProviderClass &&
                typeof ProviderClass.canHandleUrl === 'function' &&
                ProviderClass.canHandleUrl(targetLink) === true
            ) {
                return ProviderClass
            }
        }

        return null
    }

    static getProvider(platform, credentials = {}, postLink = '') {
        const cleanPlatform = String(platform || '')
            .toLowerCase()
            .trim()

        const byLink = this.detectProviderClassByLink(postLink)
        const ProviderClass = byLink || PROVIDER_REGISTRY.get(cleanPlatform)

        if (!ProviderClass) {
            throw new Error(`Платформа "${platform}" пока не поддерживается`)
        }

        const provider = new ProviderClass(credentials)
        return BaseSocialProvider.createSafeProxy(provider)
    }

    /**
     * Если ответ getComments — объект YouTube { postContext, comments: string[] },
     * превращаем его в формат, который ждёт остальной код (как у Telegram).
     */
    static normalizeCommentsForAnalysis(providerResult) {
        const isYoutubeShape =
            providerResult &&
            typeof providerResult === 'object' &&
            !Array.isArray(providerResult) &&
            Array.isArray(providerResult.comments)

        if (!isYoutubeShape) {
            return {
                rawComments: Array.isArray(providerResult) ? providerResult : [],
                youtubePostContext: '',
            }
        }

        const strings = providerResult.comments
        const rawComments = []
        for (let i = 0; i < strings.length; i++) {
            const item = strings[i]
            if (item && typeof item === 'object') {
                let commentId = 'yt-' + i
                let authorName = 'YouTube'
                let content = ''
                let dateValue = new Date()
                let mediaValue = null
                let threadValue = null

                if (item.comment_id) {
                    commentId = String(item.comment_id)
                }
                if (item.author_name) {
                    authorName = String(item.author_name)
                }
                if (item.content) {
                    content = String(item.content)
                }
                if (item.date) {
                    dateValue = item.date
                }
                if (item.media) {
                    mediaValue = item.media
                }
                if (item.thread) {
                    threadValue = item.thread
                }

                rawComments.push({
                    comment_id: commentId,
                    author_name: authorName,
                    content: content,
                    date: dateValue,
                    media: mediaValue,
                    thread: threadValue,
                })
            } else {
                rawComments.push({
                    comment_id: 'yt-' + i,
                    author_name: 'YouTube',
                    content: String(item),
                    date: new Date(),
                })
            }
        }

        let hint = ''
        if (providerResult.postContext) {
            hint = String(providerResult.postContext)
        }

        return {
            rawComments: rawComments,
            youtubePostContext: hint,
        }
    }
}

export default SocialFactory

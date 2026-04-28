import SocialFactory from '../services/social/social.factory.js'

/**
 * ID пользователя из payload JWT (поддержка разных имён полей).
 */
export function getUserIdFromTokenPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return null
    }
    const id = payload.id ?? payload.userId ?? payload._id ?? payload.sub
    if (id === undefined || id === null || id === '') {
        return null
    }
    return id
}

/**
 * Определяет платформу по URL (для analyze).
 * @returns {'youtube'|'telegram'|null}
 */
export function detectPlatformFromTargetUrl(targetUrl) {
    return SocialFactory.detectPlatformByLink(targetUrl)
}

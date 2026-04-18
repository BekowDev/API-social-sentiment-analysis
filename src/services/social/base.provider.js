const SAFE_METHOD_FALLBACKS = {
    connect: null,
    getComments: [],
    getPostMedia: { buffer: null, mimeType: null, text: '' },
    getPostReactions: [],
}

function cloneFallback(value) {
    if (Array.isArray(value)) {
        return []
    }
    if (value && typeof value === 'object') {
        return { ...value }
    }
    return value
}

class BaseSocialProvider {
    constructor(credentials) {
        this.credentials = credentials || {}
    }

    async connect() {
        return null
    }

    async getComments() {
        return []
    }

    async getPostMedia() {
        return { buffer: null, mimeType: null, text: '' }
    }

    async getPostReactions() {
        return []
    }

    static createSafeProxy(provider) {
        if (!provider || typeof provider !== 'object') {
            throw new Error('Provider instance is required')
        }

        return new Proxy(provider, {
            get(target, prop, receiver) {
                const original = Reflect.get(target, prop, receiver)

                if (
                    typeof original !== 'function' ||
                    !Object.prototype.hasOwnProperty.call(
                        SAFE_METHOD_FALLBACKS,
                        prop,
                    )
                ) {
                    return original
                }

                return async function safeProviderMethod(...args) {
                    try {
                        return await original.apply(target, args)
                    } catch (error) {
                        const fallback = cloneFallback(SAFE_METHOD_FALLBACKS[prop])
                        console.error(
                            `[provider:${target.constructor?.name || 'unknown'}] method ${String(prop)} failed:`,
                            error?.message || error,
                        )
                        return fallback
                    }
                }
            },
        })
    }
}

export default BaseSocialProvider

const DEFAULT_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/127.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
]

function splitCsvEnv(raw) {
    if (!raw || typeof raw !== 'string') {
        return []
    }

    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

function pickRandom(items, fallback = null) {
    if (!Array.isArray(items) || items.length === 0) {
        return fallback
    }
    const index = Math.floor(Math.random() * items.length)
    return items[index]
}

class ProxyManager {
    constructor() {
        this.proxyPool = splitCsvEnv(
            process.env.PROXY_URLS || process.env.PROXY_LIST || '',
        )

        const envUserAgents = splitCsvEnv(process.env.USER_AGENTS || '')
        this.userAgents =
            envUserAgents.length > 0 ? envUserAgents : DEFAULT_USER_AGENTS
    }

    getRandomUserAgent() {
        return pickRandom(this.userAgents, DEFAULT_USER_AGENTS[0])
    }

    getRandomProxyUrl() {
        return pickRandom(this.proxyPool, null)
    }

    buildAxiosConfig(baseConfig = {}) {
        const userAgent = this.getRandomUserAgent()
        const proxyUrl = this.getRandomProxyUrl()

        const headers = {
            'User-Agent': userAgent,
            ...(baseConfig.headers || {}),
        }

        const nextConfig = {
            ...baseConfig,
            headers,
        }

        if (!proxyUrl) {
            return nextConfig
        }

        try {
            const parsed = new URL(proxyUrl)
            nextConfig.proxy = {
                protocol: parsed.protocol.replace(':', ''),
                host: parsed.hostname,
                port: Number(parsed.port),
            }

            if (parsed.username || parsed.password) {
                nextConfig.proxy.auth = {
                    username: decodeURIComponent(parsed.username || ''),
                    password: decodeURIComponent(parsed.password || ''),
                }
            }
        } catch (error) {
            console.error('[proxy-manager] invalid proxy URL:', proxyUrl)
        }

        return nextConfig
    }

    buildTelegramProxyConfig() {
        const proxyUrl = this.getRandomProxyUrl()
        if (!proxyUrl) {
            return null
        }

        try {
            const parsed = new URL(proxyUrl)
            return {
                ip: parsed.hostname,
                port: Number(parsed.port),
                socksType: parsed.protocol.startsWith('socks5') ? 5 : 4,
                user: parsed.username
                    ? decodeURIComponent(parsed.username)
                    : undefined,
                pass: parsed.password
                    ? decodeURIComponent(parsed.password)
                    : undefined,
            }
        } catch (error) {
            console.error('[proxy-manager] invalid Telegram proxy URL:', proxyUrl)
            return null
        }
    }
}

export default new ProxyManager()

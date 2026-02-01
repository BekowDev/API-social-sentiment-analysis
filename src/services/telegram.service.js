import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

class TelegramService {
    constructor() {
        // Твои рабочие ключи API от Telegram
        this.apiId = process.env.TG_API_ID
        this.apiHash = process.env.TG_API_HASH
    }

    async createClient(sessionStr = '') {
        return new TelegramClient(
            new StringSession(sessionStr),
            this.apiId,
            this.apiHash,
            {
                connectionRetries: 5,
                deviceModel: 'BackendServer_v1',
                systemVersion: 'Node.js_' + process.version,
            },
        )
    }
}

export default new TelegramService()

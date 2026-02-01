import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

class TelegramService {
    constructor() {
        // Твои рабочие ключи

        this.apiId = 38264239
        this.apiHash = 'ac2baae55001d41f245b8f0f41140eea'
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

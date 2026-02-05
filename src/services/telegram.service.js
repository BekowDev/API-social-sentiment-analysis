import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

class TelegramService {
    constructor() {
        // this.apiId = process.env.TG_API_ID
        // this.apiHash = process.env.TG_API_HASH
        this.apiId = 34175562
        this.apiHash = '1a6e4bccb1e09c9c1afd72ca62cf23d3'
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
    async getPostComments(client, link) {
        try {
            console.log('--- НАЧИНАЕМ СБОР КОММЕНТАРИЕВ (НОВАЯ ВЕРСИЯ) ---') // Этот лог покажет, обновился ли код

            const parts = link.split('/')
            const messageId = parseInt(parts.pop())
            const channelName = parts.pop()

            const comments = []

            // Добавляем limit, чтобы не зависнуть на тысячах комментов
            for await (const message of client.iterMessages(channelName, {
                replyTo: messageId,
                limit: 50,
            })) {
                // 1. ЛОГИКА ТЕКСТА (Стикеры/Фото)
                let contentText = message.text || ''
                if (!contentText) {
                    if (message.sticker) contentText = '[Стикер]'
                    else if (message.photo) contentText = '[Фотография]'
                    else if (message.video) contentText = '[Видео]'
                    else if (message.voice) contentText = '[Голосовое]'
                    else contentText = '[Медиа]'
                }

                // 2. ЛОГИКА ИМЕНИ (Железобетонный вариант)
                let authorName = 'Неизвестный'
                let username = null

                try {
                    // Пытаемся получить отправителя асинхронно
                    const sender = await message.getSender()

                    if (sender) {
                        authorName =
                            `${sender.firstName || ''} ${sender.lastName || ''}`.trim()
                        username = sender.username
                            ? `@${sender.username}`
                            : null

                        // Если имя пустое (бывает у удаленных аккаунтов)
                        if (!authorName) authorName = 'Скрытый аккаунт'
                    }
                } catch (err) {
                    console.log(
                        `Не удалось получить автора для msg ${message.id}`,
                    )
                }

                // 3. Собираем объект
                // Я специально изменил названия полей, чтобы вы видели разницу
                comments.push({
                    comment_id: message.id, // Было id
                    content: contentText, // Было text
                    author_name: authorName, // Было senderName
                    author_username: username,
                    date: message.date,
                })
            }

            console.log(`Успешно собрано: ${comments.length}`)
            return comments
        } catch (e) {
            console.error('Ошибка в сервисе:', e)
            throw e
        }
    }
}

export default new TelegramService()

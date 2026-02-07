// Сюда переедет логика

// Что улучшено:

// Использует новый config.

// Есть clientCache (чтобы не логиниться 100 раз).

// Сохранена ваша логика парсинга имен и стикеров.
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { config } from '../../../config/index.js';
import BaseSocialProvider from '../base.provider.js';

// КЭШ: Храним активных клиентов
// Ключ может быть:
// 1. SessionString (для уже залогиненных)
// 2. PhoneNumber (для тех, кто в процессе входа)
const clientCache = new Map();

class TelegramProvider extends BaseSocialProvider {
    constructor(credentials = {}) {
        super(credentials);
        this.apiId = config.telegram.apiId;
        this.apiHash = config.telegram.apiHash;
        this.client = null;
    }

    /**
     * Универсальное подключение
     * @param {string} tempKey - Временный ключ (номер телефона), если сессии еще нет
     */
    async connect(tempKey = null) {
        const sessionStr = this.credentials.session || '';

        // 1. Пытаемся найти живого клиента в кэше
        // Сначала ищем по сессии, если нет — по временному ключу (номеру телефона)
        const cacheKey = sessionStr || tempKey;

        if (cacheKey && clientCache.has(cacheKey)) {
            const cached = clientCache.get(cacheKey);
            if (cached.connected) {
                this.client = cached;
                // console.log('♻️ Telegram: Использую активное соединение из кэша');
                return;
            }
        }

        // 2. Если не нашли — создаем нового
        console.log('🔄 Telegram: Создаю новое подключение...');
        this.client = new TelegramClient(
            new StringSession(sessionStr),
            this.apiId,
            this.apiHash,
            {
                connectionRetries: 5,
                useWSS: false,
                deviceModel: 'SocialAnalyzer_v1',
            },
        );

        await this.client.connect();

        // 3. Сохраняем в кэш
        if (sessionStr) {
            clientCache.set(sessionStr, this.client);
        } else if (tempKey) {
            // Если сессии нет, сохраняем по номеру телефона (для sendCode -> verifyCode)
            clientCache.set(tempKey, this.client);
        }
    }

    async sendCode(phoneNumber) {
        // Передаем номер телефона как ключ для кэширования
        await this.connect(phoneNumber);

        const result = await this.client.sendCode(
            { apiId: this.apiId, apiHash: this.apiHash },
            phoneNumber,
        );
        return result.phoneCodeHash;
    }

    async verifyCode(phoneNumber, code, phoneCodeHash) {
        // ВАЖНО: Ищем клиента именно по номеру телефона, так как сессии еще нет
        await this.connect(phoneNumber);

        try {
            await this.client.invoke(
                new Api.auth.SignIn({
                    phoneNumber,
                    phoneCodeHash,
                    phoneCode: code,
                }),
            );

            // Получаем готовую строку сессии
            const sessionString = this.client.session.save();

            // ЧИСТКА: Удаляем временный ключ (номер) и сохраняем постоянный (сессию)
            clientCache.delete(phoneNumber);
            clientCache.set(sessionString, this.client);

            return sessionString;
        } catch (e) {
            // Если ошибка, лучше сбросить кэш для этого номера, чтобы попробовать снова чисто
            clientCache.delete(phoneNumber);
            throw e;
        }
    }

    async getComments(link) {
        // Здесь уже должна быть credentials.session, поэтому connect() найдет её сам
        await this.connect();

        console.log(`📥 Telegram: Качаем комменты с ${link}`);

        const parts = link.split('/');
        const messageId = parseInt(parts.pop());
        const channelName = parts.pop();

        const comments = [];

        for await (const message of this.client.iterMessages(channelName, {
            replyTo: messageId,
            limit: undefined,
        })) {
            let contentText = message.text || '';
            if (!contentText) {
                if (message.sticker) contentText = '[Стикер]';
                else if (message.photo) contentText = '[Фотография]';
                else if (message.video) contentText = '[Видео]';
                else if (message.voice) contentText = '[Голосовое]';
                else contentText = '[Медиа]';
            }

            let authorName = 'Неизвестный';
            let username = null;

            try {
                const sender = await message.getSender();
                if (sender) {
                    authorName =
                        `${sender.firstName || ''} ${sender.lastName || ''}`.trim();
                    username = sender.username ? `@${sender.username}` : null;
                    if (!authorName) authorName = 'Скрытый аккаунт';
                }
            } catch (e) {}

            comments.push({
                comment_id: message.id,
                content: contentText,
                author_name: authorName,
                author_username: username,
                date: message.date,
            });
        }

        return comments;
    }
}

export default TelegramProvider;

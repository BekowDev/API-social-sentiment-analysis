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
        // Обработка разных форматов ссылок (иногда в конце бывает слэш)
        const messageId = parseInt(parts.pop() || parts.pop());
        const channelName = parts.pop();

        const comments = [];

        // Используем итератор для обхода сообщений
        for await (const message of this.client.iterMessages(channelName, {
            replyTo: messageId,
            limit: undefined,
        })) {
            let contentText = message.text || ''; // Берем текст, если есть (например, подпись к фото)

            // --- НОВАЯ ЛОГИКА ДЛЯ СТИКЕРОВ ---
            if (message.sticker) {
                let emoji = '';

                // Проверяем атрибуты стикера
                if (message.sticker.attributes) {
                    const stickerAttr = message.sticker.attributes.find(
                        (attr) => attr.className === 'DocumentAttributeSticker',
                    );

                    // Если нашли атрибут и в нем есть эмодзи (alt)
                    if (stickerAttr && stickerAttr.alt) {
                        emoji = stickerAttr.alt;
                    }
                }

                // Добавляем эмодзи к тексту. ИИ поймет смайлик лучше, чем слово "Стикер"
                // Результат будет: "[Стикер] 😂" или просто "😂"
                contentText = `${contentText} [Стикер] ${emoji}`.trim();
            }
            // ----------------------------------

            // Если после проверки стикера текста всё еще нет, проверяем остальные медиа
            if (!contentText) {
                if (message.photo) contentText = '[Фотография]';
                else if (message.video) contentText = '[Видео]';
                else if (message.voice) contentText = '[Голосовое]';
                else if (message.media) contentText = '[Медиа]';
            }

            // Получение автора (оставляем твою логику, она хорошая)
            let authorName = 'Неизвестный';
            let username = null;

            try {
                const sender = await message.getSender();
                if (sender) {
                    // Проверка на удаленный аккаунт или канал
                    const firstName = sender.firstName || '';
                    const lastName = sender.lastName || '';
                    const title = sender.title || ''; // Если пишет канал

                    authorName = `${firstName} ${lastName} ${title}`.trim();
                    username = sender.username ? `@${sender.username}` : null;

                    if (!authorName) authorName = 'Скрытый аккаунт';
                }
            } catch (e) {
                // Игнорируем ошибки получения сендера
            }

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

    async getPostReactions(postLink) {
        try {
            // 1. ОБЯЗАТЕЛЬНО ПОДКЛЮЧАЕМСЯ ПЕРЕД ЗАПРОСОМ
            await this.connect(); // <--- ДОБАВЬ ЭТУ СТРОКУ

            console.log('🔍 Пытаюсь получить реакции для:', postLink);

            const parts = postLink.split('/');
            const postId = parseInt(parts[parts.length - 1]);
            const channelName = parts[parts.length - 2];

            if (isNaN(postId) || !channelName) {
                console.log('❌ Ошибка парсинга ссылки');
                return [];
            }

            // Теперь запрос точно сработает
            const result = await this.client.getMessages(channelName, {
                ids: [postId],
            });

            if (!result || result.length === 0) {
                return [];
            }

            const post = result[0];

            if (!post.reactions || !post.reactions.results) {
                return [];
            }

            // Маппинг реакций
            const reactions = post.reactions.results.map((r) => {
                let emoji = '⭐'; // Заглушка для премиум стикеров

                // Проверяем тип реакции
                if (r.reaction.className === 'ReactionEmoji') {
                    emoji = r.reaction.emoticon;
                }

                return {
                    emoji: emoji,
                    count: r.count,
                };
            });

            return reactions;
        } catch (e) {
            console.error('❌ Ошибка при получении реакций:', e);
            return [];
        }
    }
}

export default TelegramProvider;

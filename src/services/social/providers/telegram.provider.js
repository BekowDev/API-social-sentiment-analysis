import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { config } from '../../../config/index.js';
import BaseSocialProvider from '../base.provider.js';

const clientCache = new Map();

class TelegramProvider extends BaseSocialProvider {
    constructor(credentials = {}) {
        super(credentials);
        this.apiId = config.telegram.apiId;
        this.apiHash = config.telegram.apiHash;
        this.client = null;
    }

    // --- 1. Подключение (с кешированием) ---
    async connect() {
        const sessionStr = this.credentials.session || '';

        // Проверяем кеш
        if (clientCache.has(sessionStr)) {
            const cached = clientCache.get(sessionStr);
            if (cached.connected) {
                this.client = cached;
                return;
            }
        }

        console.log('🔄 Telegram: Подключение...');
        this.client = new TelegramClient(
            new StringSession(sessionStr),
            this.apiId,
            this.apiHash,
            {
                connectionRetries: 5,
                useWSS: false,
                deviceModel: 'SocialAnalyzer_Pro',
            }
        );

        await this.client.connect();
        clientCache.set(sessionStr, this.client);
    }

    // --- 2. Получение комментариев (ВОССТАНОВЛЕНО) ---
    // src/services/social/providers/telegram.provider.js

    async getComments(postLink) {
        await this.connect();
        try {
            const parts = postLink.split('/');
            const postId = parseInt(parts[parts.length - 1]);
            const channelName = parts[parts.length - 2];

            // Получаем сам пост
            const messages = await this.client.getMessages(channelName, {
                ids: [postId],
            });
            const post = messages[0];

            if (!post || !post.replies) return [];

            // 👇 ИЗМЕНЕНИЕ ЗДЕСЬ 👇
            const commentsParams = {
                replyTo: post.id,
                // limit: 100,      <-- БЫЛО (ограничение 100)
                limit: undefined, // <-- СТАЛО (undefined = скачать ВСЕ комментарии без лимита)
                // Или поставь limit: 3000, если боишься зависаний на миллионных каналах
            };

            console.log(`📥 Скачиваю все комментарии...`);

            // GramJS сам будет подгружать их, это может занять пару секунд
            const result = await this.client.getMessages(
                channelName,
                commentsParams
            );

            console.log(`✅ Получено ${result.length} комментариев`);

            return result.map((msg) => {
                let authorName = 'User';
                if (msg.sender) {
                    authorName = msg.sender.firstName
                        ? `${msg.sender.firstName} ${msg.sender.lastName || ''}`.trim()
                        : msg.sender.username || 'User';
                }

                return {
                    comment_id: msg.id,
                    author_name: authorName,
                    content: msg.message,
                    date: msg.date,
                };
            });
        } catch (e) {
            console.error('Ошибка получения комментариев:', e);
            return [];
        }
    }

    // --- 3. Получение реакций (ВОССТАНОВЛЕНО) ---
    async getPostReactions(postLink) {
        await this.connect();
        try {
            const parts = postLink.split('/');
            const postId = parseInt(parts[parts.length - 1]);
            const channelName = parts[parts.length - 2];

            const result = await this.client.getMessages(channelName, {
                ids: [postId],
            });
            const post = result[0];

            if (!post || !post.reactions || !post.reactions.results) {
                return [];
            }

            return post.reactions.results.map((r) => {
                let emoji = '⭐'; // Дефолт
                if (r.reaction.className === 'ReactionEmoji') {
                    emoji = r.reaction.emoticon;
                } else if (r.reaction.className === 'ReactionCustomEmoji') {
                    emoji = '🎭'; // Кастомный эмодзи
                }

                return {
                    emoji: emoji,
                    count: r.count,
                };
            });
        } catch (e) {
            console.error('Ошибка получения реакций:', e);
            return [];
        }
    }

    // --- 4. Получение медиа (НОВОЕ, ОПТИМИЗИРОВАННОЕ) ---
    async getPostMedia(postLink) {
        await this.connect();
        try {
            const parts = postLink.split('/');
            const postId = parseInt(parts[parts.length - 1]);
            const channelName = parts[parts.length - 2];

            const messages = await this.client.getMessages(channelName, {
                ids: [postId],
            });
            const post = messages[0];

            if (!post) return { text: '' };

            let buffer = null;
            let mimeType = null;

            if (post.media) {
                // 🚀 ОПТИМИЗАЦИЯ: Качаем превью (thumb: 1)
                buffer = await this.client.downloadMedia(post.media, {
                    thumb: 1,
                });

                // Если превью нет, качаем оригинал (для фото)
                if (!buffer || buffer.length === 0) {
                    buffer = await this.client.downloadMedia(post.media);
                }

                // Упрощенная проверка типа
                if (post.media.className === 'MessageMediaPhoto') {
                    mimeType = 'image/jpeg';
                } else {
                    mimeType = 'image/jpeg'; // Для видео превью тоже будет картинкой
                }
            }

            return {
                buffer: buffer ? buffer.toString('base64') : null,
                mimeType: mimeType,
                text: post.message || '',
            };
        } catch (e) {
            console.error('Ошибка получения медиа:', e);
            return { text: '' };
        }
    }

    // --- 5. Авторизация (Оставляем как было) ---
    async sendCode(phoneNumber) {
        await this.connect();
        const result = await this.client.sendCode(
            { apiId: this.apiId, apiHash: this.apiHash },
            phoneNumber
        );
        return { phoneCodeHash: result.phoneCodeHash };
    }

    async signIn(phoneNumber, code, password) {
        await this.connect();
        const params = {
            phoneNumber: phoneNumber,
            phoneCodeHash: code.phoneCodeHash, // Если клиент передает хеш, используйте его
            phoneCode: code, // Если вы передаете просто код строкой
            onError: (err) => console.log(err),
        };

        // Маленький хак для gramjs: если передан просто код строкой
        if (typeof code === 'string') {
            params.phoneCode = code;
            // В реальном проекте хеш лучше хранить на фронте или в сессии,
            // но gramjs часто умеет сам подхватывать контекст
        }

        if (password) {
            params.password = password;
        }

        await this.client.start(params);
        return this.client.session.save();
    }
}

export default TelegramProvider;

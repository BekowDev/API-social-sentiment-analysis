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
    async connect() {
        const sessionStr = this.credentials.session || '';
        if (clientCache.has(sessionStr)) {
            const cached = clientCache.get(sessionStr);
            if (cached.connected) {
                this.client = cached;
                return;
            }
        }
        console.log('Telegram: Подключение...');
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
    async getComments(postLink, mode = 'fast') {
        await this.connect();
        try {
            const parts = postLink.split('/');
            const postId = parseInt(parts[parts.length - 1]);
            const channelName = parts[parts.length - 2];
            const commentsLimit = mode === 'deep' ? undefined : 100;

            // Получаем сам пост
            const messages = await this.client.getMessages(channelName, {
                ids: [postId],
            });
            const post = messages[0];

            if (!post || !post.replies) return [];

            // 👇 ИЗМЕНЕНИЕ ЗДЕСЬ 👇
            const commentsParams = {
                replyTo: post.id,
                limit: commentsLimit,
            };
            console.log(
                mode === 'deep'
                    ? 'Скачиваю все комментарии (mode=deep)...'
                    : 'Скачиваю до 100 комментариев (mode=fast)...'
            );
            const result = await this.client.getMessages(
                channelName,
                commentsParams
            );
            console.log(`Получено ${result.length} комментариев`);
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
                let emoji = 'Дефолт';
                if (r.reaction.className === 'ReactionEmoji')
                    emoji = r.reaction.emoticon;
                else if (r.reaction.className === 'ReactionCustomEmoji')
                    emoji = 'Кастомный эмодзи';
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
                buffer = await this.client.downloadMedia(post.media, {
                    thumb: 1,
                });

                if (!buffer || buffer.length === 0)
                    buffer = await this.client.downloadMedia(post.media);

                if (post.media.className === 'MessageMediaPhoto')
                    mimeType = 'image/jpeg';
                else mimeType = 'image/jpeg';
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
            phoneCodeHash: code.phoneCodeHash,
            phoneCode: code,
            onError: (err) => console.log(err),
        };
        if (typeof code === 'string') params.phoneCode = code;
        if (password) params.password = password;

        await this.client.start(params);
        return this.client.session.save();
    }
}

export default TelegramProvider;

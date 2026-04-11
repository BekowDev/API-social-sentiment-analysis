import TelegramProvider from './providers/telegram.provider.js';
import YouTubeProvider from './providers/youtube.provider.js';

class SocialFactory {
    /**
     * Если ответ getComments — объект YouTube { postContext, comments: string[] },
     * превращаем его в формат, который ждёт остальной код (как у Telegram).
     */
    static normalizeCommentsForAnalysis(providerResult) {
        const isYoutubeShape =
            providerResult &&
            typeof providerResult === 'object' &&
            !Array.isArray(providerResult) &&
            Array.isArray(providerResult.comments);

        if (!isYoutubeShape) {
            return {
                rawComments: providerResult,
                youtubePostContext: '',
            };
        }

        const strings = providerResult.comments;
        const rawComments = [];
        for (let i = 0; i < strings.length; i++) {
            rawComments.push({
                comment_id: 'yt-' + i,
                author_name: 'YouTube',
                content: String(strings[i]),
                date: new Date(),
            });
        }

        let hint = '';
        if (providerResult.postContext) {
            hint = String(providerResult.postContext);
        }

        return {
            rawComments: rawComments,
            youtubePostContext: hint,
        };
    }

    static getProvider(platform, credentials = {}, postLink = '') {
        const link = postLink || '';

        if (link.indexOf('youtube.com') !== -1 || link.indexOf('youtu.be') !== -1) {
            return new YouTubeProvider(credentials);
        }

        const cleanPlatform = String(platform || '')
            .toLowerCase()
            .trim();
        if (cleanPlatform === 'telegram') {
            return new TelegramProvider(credentials);
        }

        throw new Error(`Платформа "${platform}" пока не поддерживается`);
    }
}

export default SocialFactory;

import BaseSocialProvider from '../base.provider.js';

/**
 * Достаёт id ролика из обычной ссылки YouTube.
 * Поддерживаются: youtube.com/watch?v=... и youtu.be/...
 */
function extractVideoIdFromUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') {
        return null;
    }

    const url = urlString.trim();

    if (url.indexOf('youtu.be/') !== -1) {
        const start = url.indexOf('youtu.be/') + 'youtu.be/'.length;
        let id = url.slice(start);
        const q = id.indexOf('?');
        const sl = id.indexOf('/');
        let end = id.length;
        if (q !== -1) {
            end = Math.min(end, q);
        }
        if (sl !== -1) {
            end = Math.min(end, sl);
        }
        id = id.slice(0, end);
        if (id.length > 0) {
            return id;
        }
        return null;
    }

    if (url.indexOf('youtube.com') !== -1) {
        const match = url.match(/[?&]v=([^&]+)/);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

class YouTubeProvider extends BaseSocialProvider {
    constructor(credentials = {}) {
        super(credentials);
    }

    /**
     * Загружает название и описание ролика (YouTube Data API v3, videos.list).
     * @returns {{ title: string, description: string }}
     */
    async fetchVideoSnippet(videoId, apiKey) {
        const params = new URLSearchParams();
        params.set('part', 'snippet');
        params.set('id', videoId);
        params.set('key', apiKey);

        const requestUrl =
            'https://www.googleapis.com/youtube/v3/videos?' + params.toString();

        const response = await fetch(requestUrl);
        if (!response.ok) {
            const errText = await response.text();
            console.error(
                'YouTube videos.list ошибка:',
                response.status,
                errText.slice(0, 200)
            );
            return { title: '', description: '' };
        }

        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            return { title: '', description: '' };
        }

        const snippet = data.items[0].snippet;
        if (!snippet) {
            return { title: '', description: '' };
        }

        const title = snippet.title ? String(snippet.title) : '';
        const description = snippet.description
            ? String(snippet.description).trim()
            : '';

        return { title, description };
    }

    /**
     * @param {string} url - ссылка на видео
     * @param {string|number} modeOrLimit - как в базе: 'fast' / 'deep' или число лимита
     */
    async getComments(url, modeOrLimit = 'fast') {
        let limit = 50;
        if (modeOrLimit === 'deep') {
            limit = 100;
        } else if (typeof modeOrLimit === 'number' && modeOrLimit > 0) {
            limit = modeOrLimit;
        }
        if (limit > 100) {
            limit = 100;
        }
        if (limit < 1) {
            limit = 1;
        }

        const videoId = extractVideoIdFromUrl(url);
        if (!videoId) {
            return {
                postContext: 'Анализ комментариев YouTube видео',
                comments: [],
            };
        }

        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            console.error('YouTube: в .env не задан YOUTUBE_API_KEY');
            return {
                postContext: 'Анализ комментариев YouTube видео',
                comments: [],
            };
        }

        let title = '';
        let description = '';
        try {
            const snippet = await this.fetchVideoSnippet(videoId, apiKey);
            title = snippet.title;
            description = snippet.description;
        } catch (e) {
            console.error('YouTube: не удалось загрузить описание видео:', e.message);
        }

        const postContext =
            'Название видео: ' + title + '. Описание: ' + description + '.';

        const params = new URLSearchParams();
        params.set('part', 'snippet');
        params.set('videoId', videoId);
        params.set('maxResults', String(limit));
        params.set('key', apiKey);

        const requestUrl =
            'https://www.googleapis.com/youtube/v3/commentThreads?' +
            params.toString();

        try {
            const response = await fetch(requestUrl);
            if (!response.ok) {
                const errText = await response.text();
                console.error(
                    'YouTube API ошибка:',
                    response.status,
                    errText.slice(0, 200)
                );
                return {
                    postContext,
                    comments: [],
                };
            }

            const data = await response.json();
            const items = data.items;
            const texts = [];

            if (items && items.length > 0) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const snippetItem = item.snippet;
                    if (!snippetItem || !snippetItem.topLevelComment) {
                        continue;
                    }
                    const top = snippetItem.topLevelComment.snippet;
                    if (!top) {
                        continue;
                    }
                    let text = top.textOriginal;
                    if (!text) {
                        text = top.textDisplay || '';
                    }
                    if (text && String(text).trim().length > 0) {
                        texts.push(String(text).trim());
                    }
                }
            }

            return {
                postContext,
                comments: texts,
            };
        } catch (e) {
            console.error('YouTube: не удалось загрузить комментарии:', e.message);
            return {
                postContext,
                comments: [],
            };
        }
    }

    async getPostMedia(postLink) {
        return {
            buffer: null,
            mimeType: null,
            text: 'YouTube: контент страницы видео (только комментарии к ролику).',
        };
    }

    async getPostReactions() {
        return [];
    }
}

export default YouTubeProvider;

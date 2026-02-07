// Главный переключатель

// Это пульт управления. Сейчас он знает только Telegram, но потом мы добавим сюда Instagram одной строчкой.

import TelegramProvider from './providers/telegram.provider.js'

class SocialFactory {
    /**
     * Создает нужный провайдер в зависимости от платформы
     * @param {string} platform - 'telegram', 'instagram' и т.д.
     * @param {object} credentials - { session: '...' }
     */
    static getProvider(platform, credentials = {}) {
        const cleanPlatform = platform.toLowerCase().trim()

        switch (cleanPlatform) {
            case 'telegram':
                return new TelegramProvider(credentials)

            // В будущем просто раскомментируйте:
            // case 'instagram':
            //     return new InstagramProvider(credentials);

            default:
                throw new Error(
                    `Платформа "${platform}" пока не поддерживается`,
                )
        }
    }
}

export default SocialFactory

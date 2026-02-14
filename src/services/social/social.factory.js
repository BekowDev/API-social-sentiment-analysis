import TelegramProvider from './providers/telegram.provider.js';

class SocialFactory {
    static getProvider(platform, credentials = {}) {
        const cleanPlatform = platform.toLowerCase().trim();
        switch (cleanPlatform) {
            case 'telegram':
                return new TelegramProvider(credentials);
            default:
                throw new Error(
                    `Платформа "${platform}" пока не поддерживается`
                );
        }
    }
}

export default SocialFactory;

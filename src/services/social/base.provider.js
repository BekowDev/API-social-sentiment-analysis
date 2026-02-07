// Шаблон для всех

class BaseSocialProvider {
    constructor(credentials) {
        this.credentials = credentials || {}
    }

    // Эти методы должны быть реализованы в telegram.provider.js
    async connect() {
        throw new Error('Метод connect() не реализован')
    }
    async sendCode(phone) {
        throw new Error('Метод sendCode() не реализован')
    }
    async verifyCode(phone, code, hash) {
        throw new Error('Метод verifyCode() не реализован')
    }
    async getComments(link) {
        throw new Error('Метод getComments() не реализован')
    }
}

export default BaseSocialProvider

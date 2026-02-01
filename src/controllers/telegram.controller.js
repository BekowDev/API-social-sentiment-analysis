import { Api } from 'telegram' // ОБЯЗАТЕЛЬНО ДОБАВЬ ЭТУ СТРОКУ
import telegramService from '../services/social/telegram.service.js'
import Social from '../models/Social.js'

// Храним данные сессии в памяти (пока сервер запущен)
const sessionData = new Map()

class TelegramController {
    async sendCode(req, res) {
        try {
            const { phoneNumber } = req.body
            const client = await telegramService.createClient('')

            await client.connect()

            const result = await client.sendCode(
                {
                    apiId: telegramService.apiId,
                    apiHash: telegramService.apiHash,
                },
                phoneNumber,
            )

            // Сохраняем и хеш, и сам объект клиента
            sessionData.set(phoneNumber, {
                phoneCodeHash: result.phoneCodeHash,
                client,
            })

            console.log(`--- КОД ОТПРАВЛЕН: ${phoneNumber} ---`)
            res.json({ message: 'Код отправлен', phoneNumber })
        } catch (e) {
            console.error('ОШИБКА TG SEND:', e)
            res.status(500).json({ message: e.message })
        }
    }

    async verifyCode(req, res) {
        try {
            const { phoneNumber, code } = req.body
            const data = sessionData.get(phoneNumber)

            if (!data) {
                return res.status(400).json({
                    message:
                        'Сессия не найдена. Запросите код заново (сервер мог перезагрузиться).',
                })
            }

            const { phoneCodeHash, client } = data

            // Используем прямой вызов API через Api.auth.SignIn
            // Это самый надежный способ в GramJS
            await client.invoke(
                new Api.auth.SignIn({
                    phoneNumber: phoneNumber,
                    phoneCodeHash: phoneCodeHash,
                    phoneCode: code,
                }),
            )

            // Генерируем строку сессии
            const sessionString = client.session.save()

            // Сохраняем в базу данных
            const socialAccount = await Social.create({
                userId: req.user?.id || null,
                platform: 'telegram',
                accountName: phoneNumber,
                credentials: { session: sessionString },
                type: 'user_session',
            })

            // Чистим временную память
            sessionData.delete(phoneNumber)

            res.json({
                message: 'Аккаунт успешно подключен!',
                account: socialAccount,
            })
        } catch (e) {
            console.error('ОШИБКА TG VERIFY:', e)
            res.status(500).json({
                message: 'Ошибка верификации: ' + e.message,
            })
        }
    }
}

export default new TelegramController()

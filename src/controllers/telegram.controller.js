import { Api } from 'telegram' // ОБЯЗАТЕЛЬНО ДОБАВЬ ЭТУ СТРОКУ
import telegramService from '../services/telegram.service.js'
import Social from '../models/Social.js'
import aiService from '../services/ai.service.js' // Импортируем новый сервис

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
                    apiId: 34175562,
                    apiHash: '1a6e4bccb1e09c9c1afd72ca62cf23d3',
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
                    message: 'Сессия не найдена. Запросите код заново.',
                })
            }

            const { phoneCodeHash, client } = data

            // Входим в Telegram
            await client.invoke(
                new Api.auth.SignIn({
                    phoneNumber: phoneNumber,
                    phoneCodeHash: phoneCodeHash,
                    phoneCode: code,
                }),
            )

            const sessionString = client.session.save()
            let socialAccount // Создаем переменную для ответа

            // 1. Ищем существующий аккаунт
            socialAccount = await Social.findOne({
                userId: req.user.id,
                platform: 'telegram',
            })

            if (socialAccount) {
                // 2. ОБНОВЛЯЕМ (если нашли)
                socialAccount.accountName = phoneNumber
                socialAccount.credentials = { session: sessionString }
                await socialAccount.save()
                console.log(`Аккаунт обновлен: ${phoneNumber}`)
            } else {
                // 3. СОЗДАЕМ (если не нашли)
                socialAccount = await Social.create({
                    userId: req.user.id,
                    platform: 'telegram',
                    accountName: phoneNumber,
                    credentials: { session: sessionString },
                    type: 'user_session',
                })
                console.log(`Создан новый аккаунт: ${phoneNumber}`)
            }

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
    async getComments(req, res) {
        try {
            const { phoneNumber, postLink } = req.body

            // 1. Пытаемся найти клиента в оперативной памяти
            let clientData = sessionData.get(phoneNumber)
            let client

            if (clientData && clientData.client) {
                client = clientData.client
            } else {
                // 2. Если в памяти нет (сервер перезагрузился), берем из БД
                const socialAccount = await Social.findOne({
                    userId: req.user.id,
                    accountName: phoneNumber,
                    platform: 'telegram',
                })

                if (!socialAccount || !socialAccount.credentials?.session) {
                    return res.status(401).json({
                        message:
                            'Сессия не найдена. Сначала авторизуйтесь через /tg/verify',
                    })
                }

                // Создаем клиента заново из сохраненной строки
                client = await telegramService.createClient(
                    socialAccount.credentials.session,
                )
                await client.connect()

                // Сохраняем в память, чтобы не подключаться каждый раз заново
                sessionData.set(phoneNumber, { client })
            }

            // 3. Получаем комментарии
            const comments = await telegramService.getPostComments(
                client,
                postLink,
            )

            res.json({
                success: true,
                count: comments.length,
                comments,
            })
        } catch (e) {
            console.error('ОШИБКА ПОЛУЧЕНИЯ КОММЕНТАРИЕВ:', e)
            res.status(500).json({ message: 'Ошибка: ' + e.message })
        }
    }
    async pickWinner(req, res) {
        try {
            const { phoneNumber, postLink, onlyUniqueUsers = true } = req.body

            // 1. Сначала получаем все комментарии (используем уже готовую логику)
            // Восстанавливаем сессию (как мы делали в getComments)
            const socialAccount = await Social.findOne({
                userId: req.user.id,
                accountName: phoneNumber,
                platform: 'telegram',
            })

            if (!socialAccount)
                return res.status(401).json({ message: 'Авторизуйтесь' })

            const client = await telegramService.createClient(
                socialAccount.credentials.session,
            )
            await client.connect()

            // Получаем сырой список
            const allComments = await telegramService.getPostComments(
                client,
                postLink,
            )

            // 2. ФИЛЬТРАЦИЯ
            let candidates = allComments

            // Убираем тех, кто прислал ТОЛЬКО стикеры (по желанию)
            // candidates = candidates.filter(c => c.content !== '[Стикер]');

            // Если нужно, чтобы 1 человек = 1 шанс (убираем дубликаты по ID юзера)
            if (onlyUniqueUsers) {
                const seenUsers = new Set()
                candidates = candidates.filter((comment) => {
                    // Используем username или имя как уникальный ключ
                    const userKey =
                        comment.author_username || comment.author_name
                    if (seenUsers.has(userKey)) {
                        return false
                    }
                    seenUsers.add(userKey)
                    return true
                })
            }

            // 3. РАНДОМАЙЗЕР
            if (candidates.length === 0) {
                return res.json({
                    message: 'Нет подходящих участников для розыгрыша',
                })
            }

            const randomIndex = Math.floor(Math.random() * candidates.length)
            const winner = candidates[randomIndex]

            res.json({
                success: true,
                total_comments: allComments.length,
                unique_participants: candidates.length,
                winner: {
                    name: winner.author_name,
                    username: winner.author_username,
                    text: winner.content,
                    date: new Date(winner.date * 1000).toLocaleString(), // Делаем дату читаемой
                },
            })
        } catch (e) {
            console.error(e)
            res.status(500).json({ message: e.message })
        }
    }
    async getAnalyzedComments(req, res) {
        try {
            const { phoneNumber, postLink } = req.body

            // 1. АВТОРИЗАЦИЯ И ПОЛУЧЕНИЕ КЛИЕНТА (как мы делали раньше)
            // (Кратко для примера, используйте полную версию с восстановлением сессии)
            const socialAccount = await Social.findOne({
                userId: req.user.id,
                accountName: phoneNumber,
            })
            if (!socialAccount)
                return res.status(401).json({ message: 'Нет авторизации' })

            const client = await telegramService.createClient(
                socialAccount.credentials.session,
            )
            await client.connect()

            // 2. ПОЛУЧАЕМ КОММЕНТАРИИ ИЗ TELEGRAM
            // (Получаем массив объектов: { content, author_name, date ... })
            const rawComments = await telegramService.getPostComments(
                client,
                postLink,
            )

            // 3. ОТПРАВЛЯЕМ В AI НА АНАЛИЗ
            // ИИ вернет массив такой же длины: [{ sentiment: 'positive', score: 0.9, ... }]
            const aiResults = await aiService.analyzeComments(rawComments)

            // 4. ОБЪЕДИНЕНИЕ ДАННЫХ (MERGE)
            // Если ИИ вернул ответ, мы приклеиваем его к нашим комментариям
            const finalData = rawComments.map((comment, index) => {
                // Ищем соответствующий результат от ИИ (по индексу или тексту)
                // Так как порядок сохраняется, можно пробовать по индексу,
                // но безопаснее сопоставить текст, если вы фильтровали пустые.

                // Простой вариант (если не фильтровали пустые перед отправкой):
                const aiData = aiResults ? aiResults[index] : null

                return {
                    ...comment, // Оставляем id, author_name, date
                    analysis: aiData
                        ? {
                              sentiment: aiData.sentiment, // positive/negative
                              score: aiData.score, // 0.99
                              is_toxic: aiData.is_toxic, // true/false
                              lang: aiData.language, // ru/kk/en
                          }
                        : { sentiment: 'not_analyzed' }, // Если ИИ упал
                }
            })

            // 5. ПОДСЧЕТ СТАТИСТИКИ (Бонус)
            const stats = {
                total: finalData.length,
                positive: finalData.filter(
                    (c) => c.analysis?.sentiment === 'positive',
                ).length,
                negative: finalData.filter(
                    (c) => c.analysis?.sentiment === 'negative',
                ).length,
                neutral: finalData.filter(
                    (c) => c.analysis?.sentiment === 'neutral',
                ).length,
                toxic: finalData.filter((c) => c.analysis?.is_toxic).length,
            }

            res.json({
                success: true,
                stats,
                comments: finalData,
            })
        } catch (e) {
            console.error(e)
            res.status(500).json({ message: e.message })
        }
    }
}

export default new TelegramController()

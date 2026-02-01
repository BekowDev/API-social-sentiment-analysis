import { Router } from 'express'
import telegramController from '../controllers/telegram.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'

const router = new Router()

// Эндпоинты для подключения Telegram
router.post('/tg/send-code', authMiddleware, telegramController.sendCode)
router.post('/tg/verify', authMiddleware, telegramController.verifyCode)

export default router

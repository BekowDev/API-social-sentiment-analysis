import { Router } from 'express'
import telegramController from '../controllers/telegram.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'

const router = new Router()

// Эндпоинты для подключения Telegram
router.post('/tg/send-code', authMiddleware, telegramController.sendCode)
router.post('/tg/verify', authMiddleware, telegramController.verifyCode)
router.post('/tg/comments', authMiddleware, telegramController.getComments)
router.post('/tg/winner', authMiddleware, telegramController.pickWinner)
router.post(
    '/tg/analyze',
    authMiddleware,
    telegramController.getAnalyzedComments,
)
export default router

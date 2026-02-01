import { Router } from 'express'
import authRoutes from './auth.routes.js'
import adminRoutes from './admin.routes.js'
import socialRoutes from './social.routes.js' // Добавляем этот импорт
import { authMiddleware, checkRole } from '../middlewares/auth.middleware.js'

const router = new Router()

// 1. Маршруты авторизации
router.use('/auth', authRoutes)

// 2. Маршруты админки
router.use('/admin', adminRoutes)

// 3. Маршруты для соцсетей (Telegram и др.)
router.use('/social', socialRoutes)

// Тестовый роут для админа
router.get('/admin/stats', authMiddleware, checkRole('admin'), (req, res) => {
    res.json({ message: 'Это видит только админ' })
})

export default router

import { Router } from 'express'
import authRoutes from './auth.routes.js'
import adminRoutes from './admin.routes.js' // Импорт уже есть
import { authMiddleware, checkRole } from '../middlewares/auth.middleware.js'

const router = new Router()

router.use('/auth', authRoutes)
router.use('/admin', adminRoutes) // ДОБАВЬ ЭТУ СТРОКУ!

// Твой тестовый роут
router.get('/admin/stats', authMiddleware, checkRole('admin'), (req, res) => {
    res.json({ message: 'Это видит только админ' })
})

export default router

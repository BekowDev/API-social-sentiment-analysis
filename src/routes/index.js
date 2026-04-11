import { Router } from 'express'
import authRoutes from './auth.routes.js'
import adminRoutes from './admin.routes.js'
import socialRoutes from './social.routes.js'

const router = new Router()

router.use('/auth', authRoutes)
router.use('/admin', adminRoutes)
router.use('/social', socialRoutes)

export default router

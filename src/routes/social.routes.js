import { Router } from 'express'
import socialController from '../controllers/social.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'

const router = new Router()

router.use(authMiddleware)

router.post('/send-code', socialController.sendCode)
router.post('/verify', socialController.verifyCode)
router.post('/analyze', socialController.analyzePost)
router.get('/tasks/:taskId', socialController.getTaskStatus)
router.get('/history', socialController.getHistory)
router.get('/history/:id', socialController.getAnalysisById)

export default router

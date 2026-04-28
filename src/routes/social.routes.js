import { Router } from 'express'
import socialController from '../controllers/social.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'
import validate from '../middlewares/validate.middleware.js'
import { analyzePostSchema } from '../validations/social.validation.js'

const router = new Router()

router.use(authMiddleware)

router.post('/analyze', validate(analyzePostSchema), socialController.analyzePost)
router.get('/task/:taskId', socialController.getTaskStatus)
router.get('/tasks/:taskId', socialController.getTaskStatus)
router.get('/history', socialController.getHistory)
router.get('/history/:id', socialController.getAnalysisById)
router.delete('/history', socialController.clearHistory)

export default router

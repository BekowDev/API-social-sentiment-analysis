import { Router } from 'express'
import { authMiddleware, checkRole } from '../middlewares/auth.middleware.js'
import adminController from '../controllers/admin.controller.js'

const router = new Router()

router.use(authMiddleware, checkRole('admin'))

router.get('/stats', adminController.getStats)
router.post('/promote', adminController.makeAdmin)
router.post('/demote', adminController.removeAdmin)
router.post('/users', adminController.createUser)
router.patch('/users/:id/ban', adminController.toggleBan)
router.delete('/users/:id', adminController.deleteUser)

export default router

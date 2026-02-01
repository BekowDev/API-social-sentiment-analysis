import { Router } from 'express'
import { authMiddleware, checkRole } from '../middlewares/auth.middleware.js'
import adminController from '../controllers/admin.controller.js'

const router = new Router()

router.post(
    '/promote',
    authMiddleware,
    checkRole('admin'),
    adminController.makeAdmin,
)
router.post(
    '/demote',
    authMiddleware,
    checkRole('admin'),
    adminController.removeAdmin,
)
router.post(
    '/users',
    authMiddleware,
    checkRole('admin'),
    adminController.createUser,
)
router.patch(
    '/users/:id/ban',
    authMiddleware,
    checkRole('admin'),
    adminController.toggleBan,
)
router.delete(
    '/users/:id',
    authMiddleware,
    checkRole('admin'),
    adminController.deleteUser,
)
export default router

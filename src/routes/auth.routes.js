import { Router } from 'express'
import authController from '../controllers/auth.controller.js'
const router = new Router()

router.post('/register', authController.registration)
router.post('/login', authController.login)
export default router

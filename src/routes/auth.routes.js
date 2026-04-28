import { Router } from 'express';
import authController from '../controllers/auth.controller.js';
import validate from '../middlewares/validate.middleware.js';
import {
    registerSchema,
    loginSchema,
    verifyCodeSchema,
} from '../validations/auth.validation.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = new Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post(
    '/verify-code',
    validate(verifyCodeSchema),
    authController.verifyCode
);
router.delete('/me', authMiddleware, authController.deleteMe);

export default router;

import { Router } from 'express';
import socialController from '../controllers/social.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = new Router();

router.post('/send-code', authMiddleware, socialController.sendCode);
router.post('/verify', authMiddleware, socialController.verifyCode);
router.post('/analyze', authMiddleware, socialController.analyzePost);
router.get('/history', authMiddleware, socialController.getHistory);
router.get('/history/:id', authMiddleware, socialController.getAnalysisById);

export default router;

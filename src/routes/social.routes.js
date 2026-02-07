import { Router } from 'express';
import socialController from '../controllers/social.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = new Router();

// --- ОСНОВНЫЕ МАРШРУТЫ ---

// 1. Отправка кода (Telegram)
router.post('/send-code', authMiddleware, socialController.sendCode);

// 2. Проверка кода
router.post('/verify', authMiddleware, socialController.verifyCode);

// 3. Анализ поста (Парсинг + ИИ + Сохранение)
router.post('/analyze', authMiddleware, socialController.analyzePost);

// --- ИСТОРИЯ (НОВЫЕ) ---

// 4. Получить список всей истории
router.get('/history', authMiddleware, socialController.getHistory);

// 5. Получить детали одного анализа
router.get('/history/:id', authMiddleware, socialController.getAnalysisById);

// ВАЖНО: Роут '/winner' мы удалили, так как удалили этот метод из контроллера!

export default router;

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import socialRoutes from './social.routes.js';
import { authMiddleware, checkRole } from '../middlewares/auth.middleware.js';

const router = new Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/social', socialRoutes);

router.get('/admin/stats', authMiddleware, checkRole('admin'), (req, res) => {
    res.json({ message: 'Это видит только админ' });
});

export default router;

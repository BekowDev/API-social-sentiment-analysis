import authService from '../services/auth.service.js';
import User from '../models/User.js';
import emailService from '../services/email.service.js';

function generateFourDigitVerificationCode() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return String(n);
}

class AuthController {
    async register(req, res) {
        try {
            const { email, password, name } = req.body;

            const normalizedEmail = email.toLowerCase().trim();
            const candidate = await User.findOne({ email: normalizedEmail });
            if (candidate) {
                return res
                    .status(400)
                    .json({ message: 'Пользователь с таким email уже существует' });
            }

            const verificationToken = generateFourDigitVerificationCode();

            const user = await User.create({
                email: normalizedEmail,
                password,
                name,
                role: 'user',
                isVerified: false,
                verificationToken,
            });

            await emailService.sendVerificationCode(user.email, verificationToken);

            return res
                .status(201)
                .json({ message: 'Успешно. Проверьте почту' });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    }

    async verifyCode(req, res) {
        try {
            const { email, code } = req.body;
            const normalizedEmail = email.toLowerCase().trim();

            const user = await User.findOne({ email: normalizedEmail });
            if (!user) {
                return res.status(404).json({ message: 'Пользователь не найден' });
            }

            if (user.verificationToken !== code) {
                return res.status(400).json({ message: 'Неверный код' });
            }

            user.isVerified = true;
            user.verificationToken = null;
            await user.save();

            return res.json({ message: 'Почта подтверждена' });
        } catch (e) {
            return res.status(400).json({ message: e.message });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;
            const normalizedEmail = email.toLowerCase().trim();

            const user = await User.findOne({ email: normalizedEmail });
            if (!user) {
                return res.status(401).json({ message: 'Пользователь не найден' });
            }

            if (user.isBanned) {
                return res.status(403).json({
                    message: 'Ваш аккаунт заблокирован. Обратитесь к администратору.',
                });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return res.status(401).json({ message: 'Неверный пароль' });
            }

            if (!user.isVerified) {
                return res.status(403).json({
                    message: 'Подтвердите email перед входом в систему',
                });
            }

            const token = authService.generateToken(user);
            return res.json({ token });
        } catch (e) {
            res.status(401).json({ message: e.message });
        }
    }
}

export default new AuthController();

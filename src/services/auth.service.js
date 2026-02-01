import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

class AuthService {
    async register(email, password) {
        const candidate = await User.findOne({ email })
        if (candidate) throw new Error('Пользователь уже существует')

        const hashedPassword = await bcrypt.hash(password, 7)

        const user = await User.create({
            email,
            password: hashedPassword,
            role: 'user',
        })

        return this.generateToken(user)
    }

    async login(email, password) {
        const user = await User.findOne({ email })
        if (!user) throw new Error('Пользователь не найден')

        // ПРОВЕРКА НА БАН — Прямо здесь в сервисе
        if (user.isBanned) {
            throw new Error(
                'Ваш аккаунт заблокирован. Обратитесь к администратору.',
            )
        }

        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) throw new Error('Неверный пароль')

        return this.generateToken(user)
    }

    generateToken(user) {
        return jwt.sign(
            {
                id: user._id,
                email: user.email,
                role: user.role,
                nonce: Math.random().toString(36).substring(7),
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' },
        )
    }
}

export default new AuthService()

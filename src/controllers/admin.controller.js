import User from '../models/User.js';

class AdminController {
    async makeAdmin(req, res) {
        try {
            const { userId } = req.body;

            const user = await User.findById(userId);
            if (!user)
                return res
                    .status(404)
                    .json({ message: 'Пользователь не найден' });

            user.role = 'admin';
            await user.save();

            res.json({ message: `Пользователь ${user.email} теперь админ` });
        } catch (e) {
            res.status(500).json({ message: 'Ошибка сервера' });
        }
    }

    async removeAdmin(req, res) {
        try {
            const { userId } = req.body;

            const user = await User.findById(userId);
            if (!user)
                return res
                    .status(404)
                    .json({ message: 'Пользователь не найден' });

            user.role = 'user';
            await user.save();

            res.json({
                message: `Пользователь ${user.email} теперь обычный пользователь`,
            });
        } catch (e) {
            res.status(500).json({ message: 'Ошибка сервера' });
        }
    }

    async createUser(req, res) {
        try {
            const { email, password, role } = req.body;
            const candidate = await User.findOne({ email });
            if (candidate)
                return res.status(400).json({ message: 'Email занят' });

            const hashedPassword = await bcrypt.hash(password, 7);
            const user = await User.create({
                email,
                password: hashedPassword,
                role,
            });

            res.status(201).json({ message: 'Пользователь создан', user });
        } catch (e) {
            res.status(500).json({ message: 'Ошибка при создании' });
        }
    }

    async toggleBan(req, res) {
        try {
            const { id } = req.params;
            const user = await User.findById(id);

            if (!user) return res.status(404).json({ message: 'Не найден' });
            if (user.role === 'admin')
                return res
                    .status(400)
                    .json({ message: 'Нельзя забанить админа' });

            user.isBanned = !user.isBanned;
            await user.save();

            res.json({ message: user.isBanned ? 'Забанен' : 'Разбанен' });
        } catch (e) {
            res.status(500).json({ message: 'Ошибка при блокировке' });
        }
    }

    async deleteUser(req, res) {
        try {
            const { id } = req.params;
            if (id === req.user.id)
                return res.status(400).json({ message: 'Себя удалять нельзя' });

            await User.findByIdAndDelete(id);
            res.json({ message: 'Пользователь удален навсегда' });
        } catch (e) {
            res.status(500).json({ message: 'Ошибка при удалении' });
        }
    }
}

export default new AdminController();

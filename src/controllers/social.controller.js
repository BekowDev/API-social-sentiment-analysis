import Social from '../models/Social.js'

class SocialController {
    // Добавить соцсеть (Telegram, VK и т.д.)
    async addSocial(req, res) {
        try {
            const { platform, credentials, accountName } = req.body

            const newSocial = await Social.create({
                userId: req.user.id, // ID берем из токена (authMiddleware)
                platform,
                credentials,
                accountName,
            })

            res.status(201).json(newSocial)
        } catch (e) {
            res.status(500).json({
                message: 'Ошибка при сохранении данных соцсети',
            })
        }
    }

    // Получить все привязанные соцсети текущего пользователя
    async getMySocials(req, res) {
        try {
            const socials = await Social.find({ userId: req.user.id })
            res.json(socials)
        } catch (e) {
            res.status(500).json({ message: 'Ошибка при получении списка' })
        }
    }

    // Удалить привязку
    async deleteSocial(req, res) {
        try {
            const { id } = req.params
            const social = await Social.findOneAndDelete({
                _id: id,
                userId: req.user.id,
            })

            if (!social)
                return res
                    .status(404)
                    .json({ message: 'Запись не нужна или доступ запрещен' })

            res.json({ message: 'Удалено успешно' })
        } catch (e) {
            res.status(500).json({ message: 'Ошибка при удалении' })
        }
    }
}

export default new SocialController()

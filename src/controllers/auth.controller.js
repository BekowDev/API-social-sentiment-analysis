import authService from '../services/auth.service.js'

class AuthController {
    async registration(req, res) {
        try {
            const { email, password } = req.body
            const token = await authService.register(email, password)
            res.status(201).json({ token })
        } catch (e) {
            res.status(400).json({ message: e.message })
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body

            const token = await authService.login(email, password)
            res.json({ token })
        } catch (e) {
            res.status(401).json({ message: e.message })
        }
    }
}

export default new AuthController()

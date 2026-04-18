import jwt from 'jsonwebtoken'
import { ForbiddenError, UnauthorizedError } from '../shared/errors.js'

export const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
        return next(new UnauthorizedError('Не авторизован'))
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded
        next()
    } catch (e) {
        return next(new UnauthorizedError('Токен невалиден'))
    }
}

export const checkRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return next(new ForbiddenError('Доступ запрещен'))
        }
        next()
    }
}

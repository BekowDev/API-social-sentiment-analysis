import {
    AppError,
    ExternalProviderError,
    RateLimitError,
    UnauthorizedError,
} from '../shared/errors.js'

function buildRequestId(req) {
    const requestId = req.headers['x-request-id']
    if (requestId) {
        return String(requestId)
    }
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeUnknownError(err) {
    const msg = String(err?.message || '')

    if (msg.includes('FLOOD')) {
        return new RateLimitError(
            'Telegram просит подождать (FloodWait). Попробуйте позже.',
        )
    }

    if (msg.includes('AUTH_KEY')) {
        return new UnauthorizedError(
            'Сессия истекла или недействительна. Авторизуйтесь заново.',
        )
    }

    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
        return new ExternalProviderError('Проблема при запросе внешнего сервиса')
    }

    return new AppError(err?.message || 'Внутренняя ошибка сервера', {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        isOperational: false,
    })
}

export default function errorMiddleware(err, req, res, next) {
    const normalizedError = err instanceof AppError ? err : normalizeUnknownError(err)
    const requestId = buildRequestId(req)
    const statusCode = Number(normalizedError.statusCode) || 500

    if (statusCode >= 500) {
        console.error(
            `[error:${requestId}]`,
            normalizedError.code,
            normalizedError.message,
        )
    }

    if (statusCode >= 400 && statusCode < 500) {
        return res.status(statusCode).json({
            status: 'fail',
            data: {
                code: normalizedError.code,
                message: normalizedError.message,
                details: normalizedError.details,
            },
        })
    }

    return res.status(statusCode).json({
        status: 'error',
        message: normalizedError.message || 'Internal server error',
        code: normalizedError.code || 'INTERNAL_ERROR',
        data: {
            requestId,
            details: normalizedError.details,
        },
    })
}

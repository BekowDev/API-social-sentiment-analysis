// "Подушку безопасности" (Error Middleware)
// В папке src/middlewares создайте файл error.middleware.js. Это спасет вас на демонстрации. Если Telegram выдаст ошибку, сервер не "упадет", а вернет понятный JSON.

export default function (err, req, res, next) {
    console.error('🔥 ОШИБКА:', err)

    // Обработка специфичных ошибок Telegram
    if (err.message && err.message.includes('FLOOD')) {
        return res.status(429).json({
            message: 'Telegram просит подождать (FloodWait). Попробуйте позже.',
        })
    }

    if (err.message && err.message.includes('AUTH_KEY')) {
        return res.status(401).json({
            message:
                'Сессия истекла или недействительна. Авторизуйтесь заново.',
        })
    }

    // Любая другая ошибка
    res.status(500).json({
        success: false,
        message: err.message || 'Внутренняя ошибка сервера',
    })
}

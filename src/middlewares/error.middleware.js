export default function (err, req, res, next) {
    console.error('ОШИБКА:', err);

    if (err.message && err.message.includes('FLOOD')) {
        return res.status(429).json({
            message: 'Telegram просит подождать (FloodWait). Попробуйте позже.',
        });
    }

    if (err.message && err.message.includes('AUTH_KEY')) {
        return res.status(401).json({
            message:
                'Сессия истекла или недействительна. Авторизуйтесь заново.',
        });
    }

    res.status(500).json({
        success: false,
        message: err.message || 'Внутренняя ошибка сервера',
    });
}

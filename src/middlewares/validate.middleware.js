const validate = (schema) => {
    return function validationMiddleware(req, res, next) {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        })

        if (error) {
            const errors = error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message,
            }))

            return res.status(400).json({
                message: 'Ошибка валидации данных',
                errors,
            })
        }

        req.body = value
        if (typeof next === 'function') {
            return next()
        }

        return res.status(500).json({
            message: 'Внутренняя ошибка middleware: next не является функцией',
        })
    }
}

export default validate

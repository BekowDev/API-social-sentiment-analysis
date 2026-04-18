import { AppError, ValidationError } from '../shared/errors.js'

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
            return next(new ValidationError('Ошибка валидации данных', errors))
        }

        req.body = value
        if (typeof next === 'function') {
            return next()
        }

        return next(
            new AppError(
                'Внутренняя ошибка middleware: next не является функцией',
                {
                    statusCode: 500,
                    code: 'MIDDLEWARE_NEXT_INVALID',
                },
            ),
        )
    }
}

export default validate

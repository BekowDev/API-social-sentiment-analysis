import Joi from 'joi';

export const registerSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.empty': 'Email обязателен',
        'string.email': 'Некорректный формат email',
        'any.required': 'Email обязателен',
    }),
    password: Joi.string().min(8).required().messages({
        'string.empty': 'Пароль обязателен',
        'string.min': 'Пароль должен быть минимум 8 символов',
        'any.required': 'Пароль обязателен',
    }),
    name: Joi.string().trim().min(2).max(50).optional().messages({
        'string.min': 'Имя должно быть не короче 2 символов',
        'string.max': 'Имя должно быть не длиннее 50 символов',
    }),
});

export const loginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.empty': 'Email обязателен',
        'string.email': 'Некорректный формат email',
        'any.required': 'Email обязателен',
    }),
    password: Joi.string().min(8).required().messages({
        'string.empty': 'Пароль обязателен',
        'string.min': 'Пароль должен быть минимум 8 символов',
        'any.required': 'Пароль обязателен',
    }),
});

export const verifyCodeSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.empty': 'Email обязателен',
        'string.email': 'Некорректный формат email',
        'any.required': 'Email обязателен',
    }),
    code: Joi.string()
        .pattern(/^\d{4}$/)
        .required()
        .messages({
            'string.empty': 'Код обязателен',
            'string.pattern.base': 'Код должен состоять из 4 цифр',
            'any.required': 'Код обязателен',
        }),
});

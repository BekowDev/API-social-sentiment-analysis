import Joi from 'joi'

export const analyzePostSchema = Joi.object({
    url: Joi.string().uri({ scheme: ['http', 'https'] }).required().messages({
        'string.empty': 'url обязателен',
        'string.uri': 'url должен быть валидной ссылкой',
        'any.required': 'url обязателен',
    }),
    batchSize: Joi.number().integer().min(10).max(10000).optional().messages({
        'number.base': 'batchSize должен быть числом',
        'number.integer': 'batchSize должен быть целым числом',
        'number.min': 'batchSize должен быть не меньше 10',
        'number.max': 'batchSize должен быть не больше 10000',
    }),
    mode: Joi.string().valid('fast', 'deep', 'full').default('fast').messages({
        'any.only': 'mode должен быть одним из: fast, deep, full',
    }),
    language: Joi.string().valid('ru', 'en', 'kk').optional().messages({
        'any.only': 'language должен быть одним из: ru, en, kk',
    }),
    phoneNumber: Joi.string().trim().max(30).optional(),
    videoFileUri: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
    videoMimeType: Joi.string().trim().max(100).optional(),
    transcript: Joi.string().trim().max(50000).optional().messages({
        'string.max': 'transcript слишком длинный (макс 50000 символов)',
    }),
})

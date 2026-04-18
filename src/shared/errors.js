class AppError extends Error {
    constructor(message, options = {}) {
        super(message || 'Application error')
        this.name = this.constructor.name
        this.statusCode = Number(options.statusCode) || 500
        this.code = options.code || 'APP_ERROR'
        this.details = options.details
        this.isOperational =
            typeof options.isOperational === 'boolean'
                ? options.isOperational
                : true
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation failed', details = []) {
        super(message, {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            details,
        })
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, { statusCode: 401, code: 'UNAUTHORIZED' })
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, { statusCode: 403, code: 'FORBIDDEN' })
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, { statusCode: 404, code: 'NOT_FOUND' })
    }
}

class ConflictError extends AppError {
    constructor(message = 'Conflict detected') {
        super(message, { statusCode: 409, code: 'CONFLICT' })
    }
}

class RateLimitError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, { statusCode: 429, code: 'RATE_LIMIT' })
    }
}

class ExternalProviderError extends AppError {
    constructor(message = 'External provider error', details) {
        super(message, {
            statusCode: 502,
            code: 'EXTERNAL_PROVIDER_ERROR',
            details,
        })
    }
}

export {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    ExternalProviderError,
}

export function sendSuccess(res, data, options = {}) {
    const statusCode = Number(options.statusCode) || 200
    const payload = {
        status: 'success',
        data: data == null ? {} : data,
    }

    if (options.meta && typeof options.meta === 'object') {
        payload.meta = options.meta
    }

    return res.status(statusCode).json(payload)
}

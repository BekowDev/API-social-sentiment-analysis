export function normalizeDateToIsoOrNull(value) {
    if (value == null || value === '') {
        return null
    }

    if (typeof value === 'number') {
        const ts = value < 10000000000 ? value * 1000 : value
        const parsedFromTimestamp = new Date(ts)
        return Number.isNaN(parsedFromTimestamp.getTime())
            ? null
            : parsedFromTimestamp.toISOString()
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString()
    }

    const parsed = new Date(String(value))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

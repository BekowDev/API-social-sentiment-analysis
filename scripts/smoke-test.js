#!/usr/bin/env node

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5000'
const AUTH_TOKEN = process.env.SMOKE_TEST_TOKEN || ''

const TESTS = []

function addTestResult(name, ok, details) {
    TESTS.push({ name, ok, details })
    const mark = ok ? 'PASS' : 'FAIL'
    console.log(`[${mark}] ${name}${details ? ` -> ${details}` : ''}`)
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message)
    }
}

async function request(path, options = {}) {
    const url = `${BASE_URL}${path}`
    const response = await fetch(url, options)
    const contentType = response.headers.get('content-type') || ''

    let body = null
    if (contentType.includes('application/json')) {
        body = await response.json()
    } else {
        body = await response.text()
    }

    return {
        status: response.status,
        headers: response.headers,
        body,
    }
}

async function testDocs() {
    const name = 'GET /docs is available'
    try {
        const res = await request('/docs')
        assert(res.status === 200, `Expected 200, got ${res.status}`)
        assert(
            typeof res.body === 'string' &&
                (res.body.includes('Swagger UI') ||
                    res.body.toLowerCase().includes('swagger')),
            'Expected Swagger HTML page',
        )
        addTestResult(name, true)
    } catch (error) {
        addTestResult(name, false, error.message)
    }
}

async function testOpenApiJson() {
    const name = 'GET /openapi.json exposes required routes'
    try {
        const res = await request('/openapi.json')
        assert(res.status === 200, `Expected 200, got ${res.status}`)
        assert(res.body && typeof res.body === 'object', 'Expected JSON object')
        assert(res.body.paths, 'OpenAPI does not contain paths section')
        assert(
            res.body.paths['/social/analyze'],
            'OpenAPI missing /social/analyze path',
        )
        assert(
            res.body.paths['/social/task/{taskId}'],
            'OpenAPI missing /social/task/{taskId} path',
        )
        addTestResult(name, true)
    } catch (error) {
        addTestResult(name, false, error.message)
    }
}

async function testAnalyzeValid() {
    const name = 'POST /api/social/analyze returns 202 JSend success'
    if (!AUTH_TOKEN) {
        addTestResult(
            name,
            false,
            'Set SMOKE_TEST_TOKEN env for authenticated requests',
        )
        return
    }

    try {
        const res = await request('/api/social/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${AUTH_TOKEN}`,
            },
            body: JSON.stringify({
                url: 'https://t.me/durov/1',
                batchSize: 100,
                mode: 'fast',
                transcript: 'Smoke test transcript context',
            }),
        })

        assert(res.status === 202, `Expected 202, got ${res.status}`)
        assert(res.body?.status === 'success', 'Expected status=success')
        assert(
            res.body?.data?.status === 'processing',
            'Expected data.status=processing',
        )
        assert(res.body?.data?.taskId, 'Expected taskId in response')
        addTestResult(name, true, `taskId=${res.body.data.taskId}`)
    } catch (error) {
        addTestResult(name, false, error.message)
    }
}

async function testAnalyzeInvalidPayload() {
    const name = 'POST /api/social/analyze invalid payload returns fail'
    if (!AUTH_TOKEN) {
        addTestResult(
            name,
            false,
            'Set SMOKE_TEST_TOKEN env for validation test',
        )
        return
    }

    try {
        const res = await request('/api/social/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${AUTH_TOKEN}`,
            },
            body: JSON.stringify({
                batchSize: 1,
            }),
        })

        assert(res.status === 400, `Expected 400, got ${res.status}`)
        assert(res.body?.status === 'fail', 'Expected status=fail')
        assert(
            res.body?.data?.code === 'VALIDATION_ERROR',
            `Expected data.code=VALIDATION_ERROR, got ${res.body?.data?.code}`,
        )
        addTestResult(name, true)
    } catch (error) {
        addTestResult(name, false, error.message)
    }
}

async function testAnalyzeInvalidToken() {
    const name = 'POST /api/social/analyze invalid token returns fail'
    try {
        const res = await request('/api/social/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer invalid.token.value',
            },
            body: JSON.stringify({
                url: 'https://t.me/durov/1',
                batchSize: 100,
            }),
        })

        assert(res.status === 401, `Expected 401, got ${res.status}`)
        assert(res.body?.status === 'fail', 'Expected status=fail')
        assert(
            res.body?.data?.code === 'UNAUTHORIZED',
            `Expected data.code=UNAUTHORIZED, got ${res.body?.data?.code}`,
        )
        addTestResult(name, true)
    } catch (error) {
        addTestResult(name, false, error.message)
    }
}

async function run() {
    console.log(`Smoke tests against: ${BASE_URL}`)
    console.log('---')

    await testDocs()
    await testOpenApiJson()
    await testAnalyzeValid()
    await testAnalyzeInvalidPayload()
    await testAnalyzeInvalidToken()

    console.log('---')
    const passed = TESTS.filter((t) => t.ok).length
    const failed = TESTS.length - passed
    console.log(`Result: ${passed}/${TESTS.length} passed, ${failed} failed`)

    if (failed > 0) {
        process.exitCode = 1
    }
}

run().catch((error) => {
    console.error('Smoke test runner failed:', error.message)
    process.exitCode = 1
})

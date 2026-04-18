import { config } from './config/index.js'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import swaggerUi from 'swagger-ui-express'
import yaml from 'js-yaml'
import connectDB from './config/db.js'
import mainRouter from './routes/index.js'
import errorMiddleware from './middlewares/error.middleware.js'
import './workers/analysis.worker.js'

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const openApiPath = path.resolve(__dirname, '../openapi.yaml')
const openApiDocument = yaml.load(readFileSync(openApiPath, 'utf8'))

connectDB()

app.use(cors())
app.use(express.json())
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument))
app.get('/openapi.json', function getOpenApiAsJson(req, res) {
    return res.json(openApiDocument)
})
app.use('/api', mainRouter)
app.use(errorMiddleware)

app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`)
})

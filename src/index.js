import { config } from './config/index.js' // 1. Берем конфиг отсюда
import express from 'express'
import cors from 'cors'
import connectDB from './config/db.js'
import mainRouter from './routes/index.js'
import errorMiddleware from './middlewares/error.middleware.js' // 2. Импортируем защиту

const app = express()

connectDB(config.mongoUri)

app.use(cors()) // Разрешить запросы со всех адресов
app.use(express.json())

app.use('/api', mainRouter)

// 🔥 ВАЖНО: Обработчик ошибок подключаем В САМОМ КОНЦЕ (после роутов)
app.use(errorMiddleware)

app.listen(config.port, () => {
    console.log(`🚀 Server running on port ${config.port}`)
})

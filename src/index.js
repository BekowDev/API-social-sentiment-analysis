import dotenv from 'dotenv'
import express from 'express'
import connectDB from './config/db.js'
import mainRouter from './routes/index.js'

dotenv.config()

const PORT = process.env.PORT
const MONGO_URI = process.env.MONGO_URI

const app = express()

connectDB(MONGO_URI)

app.use(express.json())

app.use('/api', mainRouter)

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`)
})

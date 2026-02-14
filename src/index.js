import { config } from './config/index.js';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import mainRouter from './routes/index.js';
import errorMiddleware from './middlewares/error.middleware.js';

const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use('/api', mainRouter);
app.use(errorMiddleware);

app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
});

import mongoose from 'mongoose';

const connectDB = async (MONGO_URI) => {
    try {
        const conn = await mongoose.connect(MONGO_URI);

        console.log(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        process.exit(1);
    }
};

export default connectDB;

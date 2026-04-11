import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

class AuthService {
    generateToken(user) {
        return jwt.sign(
            {
                id: user._id,
                email: user.email,
                role: user.role,
                nonce: Math.random().toString(36).substring(7),
            },
            config.jwtSecret,
            { expiresIn: '7d' }
        );
    }
}

export default new AuthService();

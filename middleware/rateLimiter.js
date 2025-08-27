const rateLimit = require('express-rate-limit');
const config = require('../config/config');

// General rate limiter
const generalLimiter = rateLimit({
    windowMs: config.RATE_LIMIT.WINDOW_MS,
    max: config.RATE_LIMIT.MAX_REQUESTS,
    message: {
        success: false,
        message: config.RATE_LIMIT.MESSAGE
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: config.RATE_LIMIT.MESSAGE,
            retryAfter: Math.ceil(config.RATE_LIMIT.WINDOW_MS / 1000)
        });
    }
});

// Strict rate limiter for sensitive operations (key generation, signing)
const strictLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 requests per 5 minutes
    message: {
        success: false,
        message: 'Terlalu banyak operasi sensitif dari IP ini. Coba lagi dalam 5 menit.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Terlalu banyak operasi sensitif dari IP ini. Coba lagi dalam 5 menit.',
            retryAfter: 300 // 5 minutes
        });
    }
});

// Verification rate limiter (more lenient for read operations)
const verificationLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // 50 verification requests per minute
    message: {
        success: false,
        message: 'Terlalu banyak verifikasi dari IP ini. Coba lagi dalam 1 menit.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    general: generalLimiter,
    strict: strictLimiter,
    verification: verificationLimiter
};
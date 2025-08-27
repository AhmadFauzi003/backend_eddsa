const path = require('path');

module.exports = {
    // Server Configuration
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // CORS Configuration
    ALLOWED_ORIGINS: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000'
    ],

    // File Upload Configuration
    UPLOAD_DIR: path.join(__dirname, '..', 'uploads'),
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_TYPES: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/png'
    ],

    // Cryptography Configuration
    EDDSA_CONFIG: {
        CURVE: 'ed25519',
        HASH_ALGORITHM: 'sha512',
        SIGNATURE_LENGTH: 64,
        PUBLIC_KEY_LENGTH: 32,
        PRIVATE_KEY_LENGTH: 32
    },

    // Multi-Signature Configuration
    MULTISIG_CONFIG: {
        MIN_SIGNERS: 2,
        MAX_SIGNERS: 5,
        DEFAULT_THRESHOLD: 2, // Minimum signatures required
        ROLES: {
            DOSEN: 'dosen',
            KAPRODI: 'kaprodi', 
            DEKAN: 'dekan',
            REKTOR: 'rektor',
            ADMIN: 'admin'
        }
    },

    // QR Code Configuration
    QR_CONFIG: {
        ERROR_CORRECTION_LEVEL: 'M',
        TYPE: 'png',
        QUALITY: 0.92,
        MARGIN: 1,
        COLOR: {
            DARK: '#000000',
            LIGHT: '#FFFFFF'
        },
        WIDTH: 256
    },

    // Document Configuration
    DOCUMENT_CONFIG: {
        HASH_ALGORITHM: 'sha256',
        METADATA_FIELDS: [
            'title',
            'type',
            'issuer',
            'recipient',
            'date_issued',
            'valid_until',
            'document_number'
        ],
        TYPES: {
            IJAZAH: 'ijazah',
            TRANSKRIP: 'transkrip',
            SURAT_KETERANGAN: 'surat_keterangan',
            SERTIFIKAT: 'sertifikat',
            SK: 'surat_keputusan'
        }
    },

    // Rate Limiting
    RATE_LIMIT: {
        WINDOW_MS: 15 * 60 * 1000, // 15 minutes
        MAX_REQUESTS: 100, // limit each IP to 100 requests per windowMs
        MESSAGE: 'Terlalu banyak request dari IP ini, coba lagi setelah 15 menit.'
    },

    // JWT Configuration (for future authentication)
    JWT_CONFIG: {
        SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
        EXPIRES_IN: '24h',
        ALGORITHM: 'HS256'
    },

    // Database Configuration (for future use)
    DATABASE: {
        HOST: process.env.DB_HOST || 'localhost',
        PORT: process.env.DB_PORT || 5432,
        NAME: process.env.DB_NAME || 'eddsa_multisig_db',
        USERNAME: process.env.DB_USERNAME || 'postgres',
        PASSWORD: process.env.DB_PASSWORD || 'password'
    },

    // Logging Configuration
    LOGGING: {
        LEVEL: process.env.LOG_LEVEL || 'info',
        FILE: path.join(__dirname, '..', 'logs', 'app.log'),
        MAX_SIZE: '20m',
        MAX_FILES: 5
    },

    // System Information
    SYSTEM_INFO: {
        NAME: 'EdDSA Multi-Signature Document System',
        VERSION: '1.0.0',
        DESCRIPTION: 'Sistem Tanda Tangan Digital berbasis EdDSA dengan Multi-Signature untuk Verifikasi Dokumen Akademik',
        AUTHOR: 'Ahmad Fauzi Saifuddin',
        STUDENT_ID: '105841102021',
        UNIVERSITY: 'Universitas Muhammadiyah Makassar',
        FACULTY: 'Fakultas Teknik',
        PROGRAM: 'Program Studi Informatika'
    },

    // Validation Rules
    VALIDATION: {
        DOCUMENT_TITLE_MIN: 5,
        DOCUMENT_TITLE_MAX: 200,
        DOCUMENT_NUMBER_PATTERN: /^[A-Z0-9\-\/]{5,50}$/,
        EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        PHONE_PATTERN: /^(\+62|62|0)8[1-9][0-9]{6,9}$/
    }
};
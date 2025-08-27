const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;

const EdDSAService = require('../services/eddsaService');
const MultiSignatureService = require('../services/multiSignatureService');
const QRCodeService = require('../services/qrCodeService');
const config = require('../config/config');

const router = express.Router();
const eddsaService = new EdDSAService();
const multiSigService = new MultiSignatureService();
const qrCodeService = new QRCodeService();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, config.UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: config.MAX_FILE_SIZE
    },
    fileFilter: function (req, file, cb) {
        if (config.ALLOWED_FILE_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'), false);
        }
    }
});

/**
 * GET /api/documents
 * Get all documents (placeholder for database integration)
 */
router.get('/', async (req, res) => {
    try {
        // In a real implementation, this would fetch from database
        const documents = [
            {
                id: 'doc-001',
                title: 'Transkrip Nilai Ahmad Fauzi Saifuddin',
                type: 'transkrip',
                status: 'signed',
                createdAt: '2025-07-15T10:00:00Z'
            },
            {
                id: 'doc-002', 
                title: 'Surat Keterangan Lulus',
                type: 'surat_keterangan',
                status: 'pending',
                createdAt: '2025-07-16T14:30:00Z'
            }
        ];

        res.json({
            success: true,
            message: 'Documents retrieved successfully',
            data: documents,
            total: documents.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve documents',
            error: error.message
        });
    }
});

/**
 * POST /api/documents
 * Create new document
 */
router.post('/', upload.single('file'), async (req, res) => {
    try {
        const { title, type, recipient, issuer, metadata } = req.body;

        // Validate required fields
        if (!title || !type || !recipient) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: title, type, recipient'
            });
        }

        // Generate document ID
        const documentId = crypto.randomUUID();

        let content = null;
        let fileInfo = null;

        // Handle file upload
        if (req.file) {
            const fileContent = await fs.readFile(req.file.path);
            fileInfo = {
                originalName: req.file.originalname,
                filename: req.file.filename,
                path: req.file.path,
                size: req.file.size,
                mimetype: req.file.mimetype
            };
            content = fileContent.toString('base64');
        }

        // Create document object
        const document = {
            id: documentId,
            title: title,
            type: type,
            recipient: recipient,
            issuer: issuer || 'Universitas Muhammadiyah Makassar',
            content: content || req.body.content || '',
            metadata: {
                ...JSON.parse(metadata || '{}'),
                documentNumber: `DOC-${Date.now()}`,
                issueDate: new Date().toISOString(),
                version: '1.0'
            },
            file: fileInfo,
            status: 'draft',
            createdAt: new Date().toISOString(),
            hash: null // Will be calculated during signing
        };

        // Calculate document hash
        document.hash = eddsaService.hashDocument(JSON.stringify({
            id: document.id,
            title: document.title,
            content: document.content,
            metadata: document.metadata
        }));

        // Store document (in real implementation, save to database)
        if (!global.documentStore) {
            global.documentStore = new Map();
        }
        global.documentStore.set(documentId, document);

        res.status(201).json({
            success: true,
            message: 'Document created successfully',
            data: {
                id: document.id,
                title: document.title,
                type: document.type,
                status: document.status,
                hash: document.hash,
                createdAt: document.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create document',
            error: error.message
        });
    }
});

/**
 * GET /api/documents/:id
 * Get specific document by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get document from store
        if (!global.documentStore || !global.documentStore.has(id)) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = global.documentStore.get(id);

        res.json({
            success: true,
            message: 'Document retrieved successfully',
            data: document
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve document',
            error: error.message
        });
    }
});

/**
 * PUT /api/documents/:id
 * Update document
 */
router.put('/:id', upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, type, recipient, metadata } = req.body;

        // Get existing document
        if (!global.documentStore || !global.documentStore.has(id)) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = global.documentStore.get(id);

        // Check if document is already signed
        if (document.status === 'signed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update signed document'
            });
        }

        // Update document fields
        if (title) document.title = title;
        if (type) document.type = type;
        if (recipient) document.recipient = recipient;
        if (metadata) {
            document.metadata = {
                ...document.metadata,
                ...JSON.parse(metadata)
            };
        }

        // Handle file update
        if (req.file) {
            const fileContent = await fs.readFile(req.file.path);
            document.file = {
                originalName: req.file.originalname,
                filename: req.file.filename,
                path: req.file.path,
                size: req.file.size,
                mimetype: req.file.mimetype
            };
            document.content = fileContent.toString('base64');
        }

        // Update timestamp and recalculate hash
        document.updatedAt = new Date().toISOString();
        document.hash = eddsaService.hashDocument(JSON.stringify({
            id: document.id,
            title: document.title,
            content: document.content,
            metadata: document.metadata
        }));

        // Update in store
        global.documentStore.set(id, document);

        res.json({
            success: true,
            message: 'Document updated successfully',
            data: {
                id: document.id,
                title: document.title,
                type: document.type,
                status: document.status,
                hash: document.hash,
                updatedAt: document.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update document',
            error: error.message
        });
    }
});

/**
 * DELETE /api/documents/:id
 * Delete document
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get document from store
        if (!global.documentStore || !global.documentStore.has(id)) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = global.documentStore.get(id);

        // Check if document is signed
        if (document.status === 'signed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete signed document'
            });
        }

        // Delete file if exists
        if (document.file && document.file.path) {
            try {
                await fs.unlink(document.file.path);
            } catch (fileError) {
                console.warn('Failed to delete file:', fileError.message);
            }
        }

        // Remove from store
        global.documentStore.delete(id);

        res.json({
            success: true,
            message: 'Document deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete document',
            error: error.message
        });
    }
});

/**
 * POST /api/documents/:id/prepare-signing
 * Prepare document for multi-signature
 */
router.post('/:id/prepare-signing', async (req, res) => {
    try {
        const { id } = req.params;
        const { signers, threshold } = req.body;

        // Get document
        if (!global.documentStore || !global.documentStore.has(id)) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = global.documentStore.get(id);

        // Validate multi-signature configuration
        const validation = multiSigService.validateMultiSigConfig(signers, threshold);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid multi-signature configuration',
                errors: validation.errors
            });
        }

        // Initialize multi-signature session
        const session = multiSigService.initializeMultiSigSession(
            document,
            signers,
            threshold
        );

        // Store session
        if (!global.multiSigStore) {
            global.multiSigStore = new Map();
        }
        global.multiSigStore.set(session.sessionId, session);

        // Update document status
        document.status = 'pending_signatures';
        document.multiSigSessionId = session.sessionId;
        document.updatedAt = new Date().toISOString();
        global.documentStore.set(id, document);

        res.json({
            success: true,
            message: 'Document prepared for multi-signature',
            data: {
                sessionId: session.sessionId,
                documentId: document.id,
                signers: session.requiredSigners,
                threshold: session.threshold,
                progress: multiSigService.getSigningProgress(session)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to prepare document for signing',
            error: error.message
        });
    }
});

/**
 * GET /api/documents/:id/qr-code
 * Generate QR code for document
 */
router.get('/:id/qr-code', async (req, res) => {
    try {
        const { id } = req.params;

        // Get document
        if (!global.documentStore || !global.documentStore.has(id)) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = global.documentStore.get(id);

        // Check if document has signatures
        if (document.status !== 'signed') {
            return res.status(400).json({
                success: false,
                message: 'Document must be signed before generating QR code'
            });
        }

        // Get signature data
        let signatureData;
        if (document.multiSigSessionId) {
            const session = global.multiSigStore?.get(document.multiSigSessionId);
            if (session) {
                signatureData = multiSigService.createAggregatedSignature(session);
            }
        } else if (document.signature) {
            signatureData = document.signature;
        }

        if (!signatureData) {
            return res.status(400).json({
                success: false,
                message: 'No signature data found'
            });
        }

        // Generate QR code
        const qrResult = await qrCodeService.generateDocumentQR(signatureData, {
            id: document.id,
            title: document.title,
            type: document.type,
            issuer: document.issuer,
            recipient: document.recipient,
            issueDate: document.metadata.issueDate
        });

        res.json({
            success: true,
            message: 'QR code generated successfully',
            data: {
                qrImage: qrResult.qrImage,
                qrData: qrResult.qrData,
                compressed: qrResult.compressed,
                size: qrResult.size
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate QR code',
            error: error.message
        });
    }
});

module.exports = router;
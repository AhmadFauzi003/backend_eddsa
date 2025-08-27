const express = require('express');
const crypto = require('crypto');

const EdDSAService = require('../services/eddsaService');
const MultiSignatureService = require('../services/multiSignatureService');
const QRCodeService = require('../services/qrCodeService');
const config = require('../config/config');

const router = express.Router();
const eddsaService = new EdDSAService();
const multiSigService = new MultiSignatureService();
const qrCodeService = new QRCodeService();

/**
 * POST /api/signatures/single
 * Create single signature for document
 */
router.post('/single', async (req, res) => {
    try {
        const { documentId, signerInfo, privateKey } = req.body;

        // Validate required fields
        if (!documentId || !signerInfo || !privateKey) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: documentId, signerInfo, privateKey'
            });
        }

        // Get document
        if (!global.documentStore || !global.documentStore.has(documentId)) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = global.documentStore.get(documentId);

        // Create signature
        const signature = eddsaService.signDocument(document, privateKey, signerInfo);

        // Store signature
        if (!global.signatureStore) {
            global.signatureStore = new Map();
        }
        global.signatureStore.set(signature.documentId, signature);

        // Update document status
        document.status = 'signed';
        document.signature = signature;
        document.signedAt = signature.metadata.signedAt;
        document.updatedAt = new Date().toISOString();
        global.documentStore.set(documentId, document);

        res.json({
            success: true,
            message: 'Document signed successfully',
            data: {
                signatureId: signature.documentId,
                documentId: documentId,
                signer: signature.signer,
                signedAt: signature.metadata.signedAt,
                algorithm: signature.metadata.algorithm
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create signature',
            error: error.message
        });
    }
});

/**
 * POST /api/signatures/multi/:sessionId/:role
 * Add signature to multi-signature session
 */
router.post('/multi/:sessionId/:role', async (req, res) => {
    try {
        const { sessionId, role } = req.params;
        const { signerInfo, privateKey } = req.body;

        // Validate required fields
        if (!signerInfo || !privateKey) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: signerInfo, privateKey'
            });
        }

        // Get multi-signature session
        if (!global.multiSigStore || !global.multiSigStore.has(sessionId)) {
            return res.status(404).json({
                success: false,
                message: 'Multi-signature session not found'
            });
        }

        const session = global.multiSigStore.get(sessionId);

        // Add signature to session
        const updatedSession = multiSigService.addSignature(
            session,
            role,
            privateKey,
            signerInfo
        );

        // Update session in store
        global.multiSigStore.set(sessionId, updatedSession);

        // If session is completed, update document status
        if (updatedSession.status === 'completed') {
            const document = global.documentStore?.get(updatedSession.documentId);
            if (document) {
                document.status = 'signed';
                document.signedAt = updatedSession.completedAt;
                document.updatedAt = new Date().toISOString();
                global.documentStore.set(updatedSession.documentId, document);
            }
        }

        // Get signing progress
        const progress = multiSigService.getSigningProgress(updatedSession);

        res.json({
            success: true,
            message: 'Signature added successfully',
            data: {
                sessionId: sessionId,
                signerRole: role,
                sessionStatus: updatedSession.status,
                progress: progress,
                signedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to add signature',
            error: error.message
        });
    }
});

/**
 * GET /api/signatures/session/:sessionId
 * Get multi-signature session details
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Get session
        if (!global.multiSigStore || !global.multiSigStore.has(sessionId)) {
            return res.status(404).json({
                success: false,
                message: 'Multi-signature session not found'
            });
        }

        const session = global.multiSigStore.get(sessionId);
        const progress = multiSigService.getSigningProgress(session);

        res.json({
            success: true,
            message: 'Session retrieved successfully',
            data: {
                sessionId: session.sessionId,
                documentId: session.documentId,
                status: session.status,
                threshold: session.threshold,
                createdAt: session.createdAt,
                completedAt: session.completedAt,
                expiresAt: session.expiresAt,
                progress: progress
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve session',
            error: error.message
        });
    }
});

/**
 * GET /api/signatures/session/:sessionId/qr/:role
 * Generate QR code for signing request
 */
router.get('/session/:sessionId/qr/:role', async (req, res) => {
    try {
        const { sessionId, role } = req.params;

        // Check if session exists
        if (!global.multiSigStore || !global.multiSigStore.has(sessionId)) {
            return res.status(404).json({
                success: false,
                message: 'Multi-signature session not found'
            });
        }

        const session = global.multiSigStore.get(sessionId);

        // Check if role is required and not yet signed
        const requiredSigner = session.requiredSigners.find(s => s.role === role);
        if (!requiredSigner) {
            return res.status(400).json({
                success: false,
                message: `Role '${role}' is not required for this document`
            });
        }

        if (requiredSigner.status === 'signed') {
            return res.status(400).json({
                success: false,
                message: `Role '${role}' has already signed this document`
            });
        }

        // Generate signing QR code
        const qrResult = await qrCodeService.generateSigningQR(sessionId, role);

        res.json({
            success: true,
            message: 'Signing QR code generated successfully',
            data: {
                qrImage: qrResult.qrImage,
                qrData: qrResult.qrData,
                signingUrl: qrResult.signingUrl,
                sessionId: sessionId,
                signerRole: role
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate signing QR code',
            error: error.message
        });
    }
});

/**
 * GET /api/signatures/:documentId
 * Get signature(s) for a document
 */
router.get('/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;

        // Get document
        if (!global.documentStore || !global.documentStore.has(documentId)) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = global.documentStore.get(documentId);

        let signatureData = null;

        // Check for single signature
        if (document.signature) {
            signatureData = {
                type: 'single',
                signature: document.signature
            };
        }
        // Check for multi-signature
        else if (document.multiSigSessionId) {
            const session = global.multiSigStore?.get(document.multiSigSessionId);
            if (session) {
                signatureData = {
                    type: 'multi',
                    session: session,
                    progress: multiSigService.getSigningProgress(session)
                };
            }
        }

        if (!signatureData) {
            return res.status(404).json({
                success: false,
                message: 'No signatures found for this document'
            });
        }

        res.json({
            success: true,
            message: 'Signatures retrieved successfully',
            data: signatureData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve signatures',
            error: error.message
        });
    }
});

/**
 * POST /api/signatures/verify
 * Verify signature(s) for a document
 */
router.post('/verify', async (req, res) => {
    try {
        const { documentId, signatureData } = req.body;

        if (!documentId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: documentId'
            });
        }

        // Get document
        if (!global.documentStore || !global.documentStore.has(documentId)) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        const document = global.documentStore.get(documentId);
        let verificationResult;

        // Determine signature type and verify
        if (signatureData && signatureData.type === 'multi') {
            // Verify multi-signature
            verificationResult = multiSigService.verifyMultiSignature(
                signatureData.session || signatureData,
                document
            );
        } else if (document.signature || signatureData) {
            // Verify single signature
            const signature = signatureData || document.signature;
            verificationResult = eddsaService.verifyDocumentSignature(signature, document);
        } else {
            return res.status(400).json({
                success: false,
                message: 'No signature data provided or found'
            });
        }

        res.json({
            success: true,
            message: 'Signature verification completed',
            data: {
                documentId: documentId,
                ...verificationResult
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to verify signature',
            error: error.message
        });
    }
});

/**
 * DELETE /api/signatures/session/:sessionId
 * Cancel multi-signature session
 */
router.delete('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Get session
        if (!global.multiSigStore || !global.multiSigStore.has(sessionId)) {
            return res.status(404).json({
                success: false,
                message: 'Multi-signature session not found'
            });
        }

        const session = global.multiSigStore.get(sessionId);

        // Check if session can be cancelled
        if (session.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel completed session'
            });
        }

        // Update document status
        const document = global.documentStore?.get(session.documentId);
        if (document) {
            document.status = 'draft';
            document.multiSigSessionId = null;
            document.updatedAt = new Date().toISOString();
            global.documentStore.set(session.documentId, document);
        }

        // Remove session
        global.multiSigStore.delete(sessionId);

        res.json({
            success: true,
            message: 'Multi-signature session cancelled successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to cancel session',
            error: error.message
        });
    }
});

module.exports = router;
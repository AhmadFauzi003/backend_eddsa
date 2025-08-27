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
 * POST /api/verification/qr
 * Verify document using QR code data
 */
router.post('/qr', async (req, res) => {
    try {
        const { qrData } = req.body;

        if (!qrData) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: qrData'
            });
        }

        // Parse QR code data
        const parsedData = qrCodeService.parseQRData(qrData);

        if (parsedData.type === 'url_verification') {
            // Handle URL-based verification
            const storedData = qrCodeService.getStoredVerificationData(parsedData.verificationId);
            
            if (!storedData) {
                return res.status(404).json({
                    success: false,
                    message: 'Verification data not found or expired'
                });
            }

            // Get document from store
            const document = global.documentStore?.get(parsedData.documentId);
            if (!document) {
                return res.status(404).json({
                    success: false,
                    message: 'Document not found'
                });
            }

            // Perform verification based on signature type
            let verificationResult;
            if (storedData.signature.algorithm === 'EdDSA-Multi') {
                // Multi-signature verification
                const session = global.multiSigStore?.get(storedData.sessionId);
                if (session) {
                    verificationResult = multiSigService.verifyMultiSignature(session, document);
                } else {
                    return res.status(404).json({
                        success: false,
                        message: 'Multi-signature session not found'
                    });
                }
            } else {
                // Single signature verification
                const signature = {
                    documentId: document.id,
                    documentHash: storedData.documentHash,
                    signature: storedData.signature.data,
                    signer: storedData.signature.signers[0]
                };
                verificationResult = eddsaService.verifyDocumentSignature(signature, document);
            }

            return res.json({
                success: true,
                message: 'Document verification completed',
                data: {
                    verificationId: parsedData.verificationId,
                    documentId: parsedData.documentId,
                    document: {
                        title: storedData.metadata.title,
                        type: storedData.metadata.type,
                        issuer: storedData.metadata.issuer,
                        recipient: storedData.metadata.recipient,
                        issueDate: storedData.metadata.issueDate
                    },
                    verification: verificationResult
                }
            });
        } 
        else if (parsedData.type === 'embedded_verification') {
            // Handle embedded verification data
            const payload = parsedData.payload;

            // Get document from store
            const document = global.documentStore?.get(payload.documentId);
            if (!document) {
                return res.status(404).json({
                    success: false,
                    message: 'Document not found'
                });
            }

            // Verify based on signature type
            let verificationResult;
            if (payload.signatureType === 'multi-signature') {
                // Create temporary session object for verification
                const tempSession = {
                    sessionId: payload.signature.sessionId || crypto.randomUUID(),
                    documentId: payload.documentId,
                    documentHash: payload.documentHash,
                    threshold: payload.signature.threshold,
                    signatures: payload.signature.data.map(sig => ({
                        signatureId: crypto.randomUUID(),
                        signature: sig.signature,
                        signer: sig.signer,
                        signedAt: sig.signedAt,
                        documentHash: payload.documentHash
                    })),
                    status: 'completed'
                };

                verificationResult = multiSigService.verifyMultiSignature(tempSession, document);
            } else {
                // Single signature verification
                const signerData = payload.signature.signers[0];
                const signature = {
                    documentId: payload.documentId,
                    documentHash: payload.documentHash,
                    signature: payload.signature.data,
                    signer: signerData
                };
                verificationResult = eddsaService.verifyDocumentSignature(signature, document);
            }

            return res.json({
                success: true,
                message: 'Document verification completed',
                data: {
                    documentId: payload.documentId,
                    document: payload.metadata,
                    verification: verificationResult
                }
            });
        }
        else {
            return res.status(400).json({
                success: false,
                message: 'Invalid QR code format'
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to verify QR code',
            error: error.message
        });
    }
});

/**
 * GET /api/verification/:verificationId
 * Get verification data by ID (for URL-based QR codes)
 */
router.get('/:verificationId', async (req, res) => {
    try {
        const { verificationId } = req.params;

        // Get stored verification data
        const storedData = qrCodeService.getStoredVerificationData(verificationId);
        
        if (!storedData) {
            return res.status(404).json({
                success: false,
                message: 'Verification data not found or expired'
            });
        }

        res.json({
            success: true,
            message: 'Verification data retrieved successfully',
            data: {
                verificationId: verificationId,
                documentId: storedData.documentId,
                metadata: storedData.metadata,
                signatureType: storedData.signatureType,
                timestamp: storedData.timestamp
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve verification data',
            error: error.message
        });
    }
});

/**
 * POST /api/verification/document/:documentId
 * Verify document directly by ID
 */
router.post('/document/:documentId', async (req, res) => {
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

        // Check if document is signed
        if (document.status !== 'signed') {
            return res.status(400).json({
                success: false,
                message: 'Document is not signed'
            });
        }

        let verificationResult;

        // Determine verification type
        if (document.multiSigSessionId) {
            // Multi-signature verification
            const session = global.multiSigStore?.get(document.multiSigSessionId);
            if (!session) {
                return res.status(404).json({
                    success: false,
                    message: 'Multi-signature session not found'
                });
            }
            verificationResult = multiSigService.verifyMultiSignature(session, document);
        } else if (document.signature) {
            // Single signature verification
            verificationResult = eddsaService.verifyDocumentSignature(document.signature, document);
        } else {
            return res.status(400).json({
                success: false,
                message: 'No signature found for document'
            });
        }

        res.json({
            success: true,
            message: 'Document verification completed',
            data: {
                documentId: documentId,
                document: {
                    title: document.title,
                    type: document.type,
                    issuer: document.issuer,
                    recipient: document.recipient,
                    signedAt: document.signedAt
                },
                verification: verificationResult
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to verify document',
            error: error.message
        });
    }
});

/**
 * GET /api/verification/report/:verificationId
 * Generate verification report
 */
router.get('/report/:verificationId', async (req, res) => {
    try {
        const { verificationId } = req.params;

        // Get stored verification data
        const storedData = qrCodeService.getStoredVerificationData(verificationId);
        
        if (!storedData) {
            return res.status(404).json({
                success: false,
                message: 'Verification data not found'
            });
        }

        // Get document
        const document = global.documentStore?.get(storedData.documentId);
        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        // Perform verification
        let verificationResult;
        if (storedData.signatureType === 'multi-signature') {
            const session = global.multiSigStore?.get(storedData.sessionId);
            if (session) {
                verificationResult = multiSigService.verifyMultiSignature(session, document);
            }
        } else {
            const signature = {
                documentId: document.id,
                documentHash: storedData.documentHash,
                signature: storedData.signature.data,
                signer: storedData.signature.signers[0]
            };
            verificationResult = eddsaService.verifyDocumentSignature(signature, document);
        }

        // Generate report
        const report = {
            reportId: crypto.randomUUID(),
            verificationId: verificationId,
            generatedAt: new Date().toISOString(),
            document: {
                id: document.id,
                title: document.title,
                type: document.type,
                issuer: document.issuer,
                recipient: document.recipient,
                issueDate: document.metadata?.issueDate,
                documentNumber: document.metadata?.documentNumber
            },
            verification: verificationResult,
            summary: {
                status: verificationResult.valid ? 'VALID' : 'INVALID',
                algorithm: storedData.signature?.algorithm || 'EdDSA',
                signatureType: storedData.signatureType,
                verificationMethod: 'QR Code Verification'
            },
            technicalDetails: {
                documentHash: storedData.documentHash,
                signatureCount: Array.isArray(storedData.signature?.data) ? 
                    storedData.signature.data.length : 1,
                verificationTimestamp: verificationResult.verifiedAt
            }
        };

        res.json({
            success: true,
            message: 'Verification report generated successfully',
            data: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate verification report',
            error: error.message
        });
    }
});

/**
 * POST /api/verification/batch
 * Batch verify multiple documents
 */
router.post('/batch', async (req, res) => {
    try {
        const { documentIds } = req.body;

        if (!Array.isArray(documentIds) || documentIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or empty documentIds array'
            });
        }

        if (documentIds.length > 10) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 10 documents allowed per batch'
            });
        }

        const results = [];

        for (const documentId of documentIds) {
            try {
                // Get document
                const document = global.documentStore?.get(documentId);
                if (!document) {
                    results.push({
                        documentId: documentId,
                        success: false,
                        error: 'Document not found'
                    });
                    continue;
                }

                // Verify document
                let verificationResult;
                if (document.multiSigSessionId) {
                    const session = global.multiSigStore?.get(document.multiSigSessionId);
                    if (session) {
                        verificationResult = multiSigService.verifyMultiSignature(session, document);
                    } else {
                        results.push({
                            documentId: documentId,
                            success: false,
                            error: 'Multi-signature session not found'
                        });
                        continue;
                    }
                } else if (document.signature) {
                    verificationResult = eddsaService.verifyDocumentSignature(document.signature, document);
                } else {
                    results.push({
                        documentId: documentId,
                        success: false,
                        error: 'No signature found'
                    });
                    continue;
                }

                results.push({
                    documentId: documentId,
                    success: true,
                    document: {
                        title: document.title,
                        type: document.type
                    },
                    verification: {
                        valid: verificationResult.valid,
                        reason: verificationResult.reason,
                        verifiedAt: verificationResult.verifiedAt
                    }
                });
            } catch (error) {
                results.push({
                    documentId: documentId,
                    success: false,
                    error: error.message
                });
            }
        }

        const validCount = results.filter(r => r.success && r.verification?.valid).length;
        const invalidCount = results.filter(r => r.success && !r.verification?.valid).length;
        const errorCount = results.filter(r => !r.success).length;

        res.json({
            success: true,
            message: 'Batch verification completed',
            data: {
                total: documentIds.length,
                valid: validCount,
                invalid: invalidCount,
                errors: errorCount,
                results: results
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to perform batch verification',
            error: error.message
        });
    }
});

module.exports = router;
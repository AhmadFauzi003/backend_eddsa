const QRCode = require('qrcode');
const crypto = require('crypto');
const config = require('../config/config');

class QRCodeService {
    constructor() {
        this.config = config.QR_CONFIG;
    }

    /**
     * Generate QR Code for document verification
     * @param {Object} signatureData - Signature data to embed
     * @param {Object} documentMetadata - Document metadata
     * @returns {Object} QR code data and image
     */
    async generateDocumentQR(signatureData, documentMetadata) {
        try {
            // Create verification payload
            const verificationPayload = {
                type: 'document_verification',
                version: '1.0',
                documentId: documentMetadata.id,
                documentHash: signatureData.documentHash,
                signatureType: signatureData.type || 'single',
                timestamp: new Date().toISOString(),
                metadata: {
                    title: documentMetadata.title,
                    type: documentMetadata.type,
                    issuer: documentMetadata.issuer,
                    recipient: documentMetadata.recipient,
                    issueDate: documentMetadata.issueDate
                },
                signature: {
                    algorithm: signatureData.algorithm,
                    data: signatureData.signatures || signatureData.signature,
                    signers: signatureData.signers || [{
                        role: signatureData.signer?.role,
                        name: signatureData.signer?.name,
                        publicKey: signatureData.signer?.publicKey
                    }]
                }
            };

            // Compress payload if too large
            const payloadString = JSON.stringify(verificationPayload);
            let qrData;

            if (payloadString.length > 2000) { // QR code size limit
                // Create verification URL instead of embedding full data
                const verificationId = crypto.randomUUID();
                qrData = JSON.stringify({
                    type: 'verification_url',
                    verificationId: verificationId,
                    url: `/api/verification/${verificationId}`,
                    documentId: documentMetadata.id,
                    quickVerify: {
                        documentHash: signatureData.documentHash.substring(0, 16),
                        signatureCount: Array.isArray(signatureData.signatures) ? 
                            signatureData.signatures.length : 1
                    }
                });

                // Store full payload separately (in practice, save to database)
                this._storeVerificationData(verificationId, verificationPayload);
            } else {
                qrData = payloadString;
            }

            // Generate QR code image
            const qrImage = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: this.config.ERROR_CORRECTION_LEVEL,
                type: this.config.TYPE,
                quality: this.config.QUALITY,
                margin: this.config.MARGIN,
                color: {
                    dark: this.config.COLOR.DARK,
                    light: this.config.COLOR.LIGHT,
                },
                width: this.config.WIDTH
            });

            return {
                qrImage: qrImage,
                qrData: qrData,
                payload: verificationPayload,
                size: payloadString.length,
                compressed: payloadString.length > 2000
            };
        } catch (error) {
            throw new Error(`Failed to generate QR code: ${error.message}`);
        }
    }

    /**
     * Generate QR code for multi-signature document
     * @param {Object} multiSigSession - Multi-signature session
     * @param {Object} documentMetadata - Document metadata
     * @returns {Object} QR code data and image
     */
    async generateMultiSigQR(multiSigSession, documentMetadata) {
        try {
            const aggregatedSignature = {
                type: 'multi-signature',
                sessionId: multiSigSession.sessionId,
                documentId: multiSigSession.documentId,
                documentHash: multiSigSession.documentHash,
                threshold: multiSigSession.threshold,
                signatures: multiSigSession.signatures.map(sig => ({
                    signer: {
                        role: sig.signer.role,
                        name: sig.signer.name,
                        publicKey: sig.signer.publicKey
                    },
                    signature: sig.signature,
                    signedAt: sig.signedAt
                }))
            };

            return await this.generateDocumentQR(aggregatedSignature, documentMetadata);
        } catch (error) {
            throw new Error(`Failed to generate multi-signature QR code: ${error.message}`);
        }
    }

    /**
     * Parse QR code data
     * @param {string} qrData - QR code data string
     * @returns {Object} Parsed verification data
     */
    parseQRData(qrData) {
        try {
            const parsedData = JSON.parse(qrData);

            if (parsedData.type === 'verification_url') {
                return {
                    type: 'url_verification',
                    verificationId: parsedData.verificationId,
                    url: parsedData.url,
                    documentId: parsedData.documentId,
                    quickVerify: parsedData.quickVerify
                };
            }

            if (parsedData.type === 'document_verification') {
                return {
                    type: 'embedded_verification',
                    payload: parsedData
                };
            }

            throw new Error('Unknown QR code format');
        } catch (error) {
            throw new Error(`Failed to parse QR data: ${error.message}`);
        }
    }

    /**
     * Generate QR code for signing request
     * @param {string} sessionId - Multi-signature session ID
     * @param {string} signerRole - Role of the signer
     * @returns {Object} QR code for signing
     */
    async generateSigningQR(sessionId, signerRole) {
        try {
            const signingData = {
                type: 'signing_request',
                sessionId: sessionId,
                signerRole: signerRole,
                url: `/api/signatures/sign/${sessionId}/${signerRole}`,
                timestamp: new Date().toISOString()
            };

            const qrImage = await QRCode.toDataURL(JSON.stringify(signingData), {
                errorCorrectionLevel: this.config.ERROR_CORRECTION_LEVEL,
                width: this.config.WIDTH,
                color: {
                    dark: '#2563eb',
                    light: '#ffffff'
                }
            });

            return {
                qrImage: qrImage,
                qrData: JSON.stringify(signingData),
                signingUrl: signingData.url
            };
        } catch (error) {
            throw new Error(`Failed to generate signing QR code: ${error.message}`);
        }
    }

    /**
     * Validate QR code data integrity
     * @param {string} qrData - QR code data
     * @returns {Object} Validation result
     */
    validateQRData(qrData) {
        try {
            const parsed = JSON.parse(qrData);
            const errors = [];

            // Check required fields based on type
            if (parsed.type === 'document_verification') {
                const requiredFields = ['documentId', 'documentHash', 'signature'];
                for (const field of requiredFields) {
                    if (!parsed[field]) {
                        errors.push(`Missing required field: ${field}`);
                    }
                }

                // Validate signature structure
                if (parsed.signature && !parsed.signature.algorithm) {
                    errors.push('Missing signature algorithm');
                }
            }

            if (parsed.type === 'verification_url') {
                const requiredFields = ['verificationId', 'url', 'documentId'];
                for (const field of requiredFields) {
                    if (!parsed[field]) {
                        errors.push(`Missing required field: ${field}`);
                    }
                }
            }

            return {
                valid: errors.length === 0,
                errors: errors,
                type: parsed.type
            };
        } catch (error) {
            return {
                valid: false,
                errors: [`Invalid JSON format: ${error.message}`],
                type: 'unknown'
            };
        }
    }

    /**
     * Generate verification report QR code
     * @param {Object} verificationResult - Verification result
     * @returns {Object} QR code for verification report
     */
    async generateVerificationReportQR(verificationResult) {
        try {
            const reportData = {
                type: 'verification_report',
                documentId: verificationResult.documentId,
                valid: verificationResult.valid,
                verifiedAt: new Date().toISOString(),
                summary: {
                    signatureType: verificationResult.signatureType,
                    signerCount: verificationResult.signerCount || 1,
                    algorithm: verificationResult.algorithm
                },
                reportUrl: `/api/verification/report/${verificationResult.verificationId}`
            };

            const qrImage = await QRCode.toDataURL(JSON.stringify(reportData), {
                errorCorrectionLevel: this.config.ERROR_CORRECTION_LEVEL,
                width: this.config.WIDTH,
                color: {
                    dark: verificationResult.valid ? '#059669' : '#dc2626',
                    light: '#ffffff'
                }
            });

            return {
                qrImage: qrImage,
                qrData: JSON.stringify(reportData),
                reportUrl: reportData.reportUrl
            };
        } catch (error) {
            throw new Error(`Failed to generate verification report QR: ${error.message}`);
        }
    }

    /**
     * Store verification data (placeholder for database storage)
     * @param {string} verificationId - Verification ID
     * @param {Object} data - Data to store
     * @private
     */
    _storeVerificationData(verificationId, data) {
        // In a real implementation, this would store to a database
        // For now, we'll use a simple in-memory store
        if (!global.verificationStore) {
            global.verificationStore = new Map();
        }
        global.verificationStore.set(verificationId, {
            data: data,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
        });
    }

    /**
     * Retrieve stored verification data
     * @param {string} verificationId - Verification ID
     * @returns {Object|null} Stored data or null if not found
     */
    getStoredVerificationData(verificationId) {
        if (!global.verificationStore) {
            return null;
        }

        const stored = global.verificationStore.get(verificationId);
        if (!stored) {
            return null;
        }

        // Check if expired
        if (new Date() > new Date(stored.expiresAt)) {
            global.verificationStore.delete(verificationId);
            return null;
        }

        return stored.data;
    }

    /**
     * Get QR code configuration
     * @returns {Object} Current QR code configuration
     */
    getConfig() {
        return {
            ...this.config,
            maxDataSize: 2000,
            supportedTypes: [
                'document_verification',
                'verification_url',
                'signing_request',
                'verification_report'
            ]
        };
    }
}

module.exports = QRCodeService;
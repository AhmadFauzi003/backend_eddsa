const crypto = require('crypto');
const EdDSAService = require('./eddsaService');
const config = require('../config/config');

class MultiSignatureService {
    constructor() {
        this.eddsaService = new EdDSAService();
        this.config = config.MULTISIG_CONFIG;
    }

    /**
     * Initialize multi-signature session for a document
     * @param {Object} document - Document to be signed
     * @param {Array} requiredSigners - Array of required signer roles/info
     * @param {number} threshold - Minimum signatures required (optional)
     * @returns {Object} Multi-signature session object
     */
    initializeMultiSigSession(document, requiredSigners, threshold = null) {
        try {
            const sessionId = crypto.randomUUID();
            const documentHash = this.eddsaService.hashDocument(
                JSON.stringify(document.content || document)
            );

            const session = {
                sessionId: sessionId,
                documentId: document.id || crypto.randomUUID(),
                documentHash: documentHash,
                requiredSigners: requiredSigners.map(signer => ({
                    role: signer.role,
                    name: signer.name,
                    email: signer.email,
                    required: signer.required !== false, // Default to required
                    status: 'pending'
                })),
                threshold: threshold || Math.min(this.config.DEFAULT_THRESHOLD, requiredSigners.length),
                signatures: [],
                status: 'pending',
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
                metadata: {
                    totalSigners: requiredSigners.length,
                    signedCount: 0,
                    pendingCount: requiredSigners.length
                }
            };

            return session;
        } catch (error) {
            throw new Error(`Failed to initialize multi-signature session: ${error.message}`);
        }
    }

    /**
     * Add signature to multi-signature session
     * @param {Object} session - Multi-signature session
     * @param {string} signerRole - Role of the signer
     * @param {string} privateKey - Signer's private key
     * @param {Object} signerInfo - Signer information
     * @returns {Object} Updated session with new signature
     */
    addSignature(session, signerRole, privateKey, signerInfo) {
        try {
            // Check if session is still valid
            if (session.status === 'completed') {
                throw new Error('Multi-signature session is already completed');
            }

            if (new Date() > new Date(session.expiresAt)) {
                throw new Error('Multi-signature session has expired');
            }

            // Check if signer is required for this document
            const requiredSigner = session.requiredSigners.find(s => s.role === signerRole);
            if (!requiredSigner) {
                throw new Error(`Signer role '${signerRole}' is not required for this document`);
            }

            // Check if this signer has already signed
            const existingSignature = session.signatures.find(s => s.signer.role === signerRole);
            if (existingSignature) {
                throw new Error(`Signer with role '${signerRole}' has already signed this document`);
            }

            // Create signature
            const signatureData = this.eddsaService.sign(session.documentHash, privateKey);
            const publicKey = this.eddsaService.getPublicKeyFromPrivate(privateKey);

            // Verify signature before adding
            const isValid = this.eddsaService.verify(
                signatureData.signature,
                session.documentHash,
                publicKey
            );

            if (!isValid) {
                throw new Error('Generated signature is invalid');
            }

            // Add signature to session
            const newSignature = {
                signatureId: crypto.randomUUID(),
                signature: signatureData.signature,
                signer: {
                    ...signerInfo,
                    role: signerRole,
                    publicKey: publicKey
                },
                signedAt: new Date().toISOString(),
                documentHash: session.documentHash,
                valid: true
            };

            session.signatures.push(newSignature);

            // Update signer status
            requiredSigner.status = 'signed';
            requiredSigner.signedAt = newSignature.signedAt;

            // Update session metadata
            session.metadata.signedCount = session.signatures.length;
            session.metadata.pendingCount = session.requiredSigners.filter(s => s.status === 'pending').length;

            // Check if threshold is met
            if (session.signatures.length >= session.threshold) {
                session.status = 'completed';
                session.completedAt = new Date().toISOString();
            }

            session.lastUpdated = new Date().toISOString();

            return session;
        } catch (error) {
            throw new Error(`Failed to add signature: ${error.message}`);
        }
    }

    /**
     * Verify all signatures in multi-signature session
     * @param {Object} session - Multi-signature session
     * @param {Object} document - Original document
     * @returns {Object} Verification result
     */
    verifyMultiSignature(session, document) {
        try {
            const results = [];
            const documentHash = this.eddsaService.hashDocument(
                JSON.stringify(document.content || document)
            );

            // Check if document hash matches session
            if (documentHash !== session.documentHash) {
                return {
                    valid: false,
                    reason: 'Document has been modified after signing',
                    documentHashMatch: false,
                    signatureResults: []
                };
            }

            // Verify each signature
            for (const signature of session.signatures) {
                try {
                    const isValid = this.eddsaService.verify(
                        signature.signature,
                        session.documentHash,
                        signature.signer.publicKey
                    );

                    results.push({
                        signatureId: signature.signatureId,
                        signer: signature.signer,
                        valid: isValid,
                        signedAt: signature.signedAt,
                        reason: isValid ? 'Valid signature' : 'Invalid signature'
                    });
                } catch (error) {
                    results.push({
                        signatureId: signature.signatureId,
                        signer: signature.signer,
                        valid: false,
                        reason: `Verification error: ${error.message}`
                    });
                }
            }

            const validSignatures = results.filter(r => r.valid).length;
            const isThresholdMet = validSignatures >= session.threshold;

            return {
                valid: isThresholdMet,
                documentHashMatch: true,
                threshold: session.threshold,
                totalSignatures: session.signatures.length,
                validSignatures: validSignatures,
                signatureResults: results,
                sessionStatus: session.status,
                verifiedAt: new Date().toISOString(),
                reason: isThresholdMet ? 
                    `Valid multi-signature with ${validSignatures}/${session.threshold} required signatures` :
                    `Insufficient valid signatures: ${validSignatures}/${session.threshold}`
            };
        } catch (error) {
            throw new Error(`Failed to verify multi-signature: ${error.message}`);
        }
    }

    /**
     * Get signing progress for a session
     * @param {Object} session - Multi-signature session
     * @returns {Object} Progress information
     */
    getSigningProgress(session) {
        const signedRoles = session.signatures.map(s => s.signer.role);
        const pendingSigners = session.requiredSigners.filter(s => !signedRoles.includes(s.role));

        return {
            sessionId: session.sessionId,
            status: session.status,
            progress: {
                signed: session.signatures.length,
                total: session.requiredSigners.length,
                threshold: session.threshold,
                percentage: Math.round((session.signatures.length / session.threshold) * 100)
            },
            signers: {
                signed: session.signatures.map(s => ({
                    role: s.signer.role,
                    name: s.signer.name,
                    signedAt: s.signedAt
                })),
                pending: pendingSigners.map(s => ({
                    role: s.role,
                    name: s.name,
                    required: s.required
                }))
            },
            timeInfo: {
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
                completedAt: session.completedAt || null,
                isExpired: new Date() > new Date(session.expiresAt)
            }
        };
    }

    /**
     * Create aggregated signature data for QR code
     * @param {Object} session - Completed multi-signature session
     * @returns {Object} Aggregated signature data
     */
    createAggregatedSignature(session) {
        try {
            if (session.status !== 'completed') {
                throw new Error('Multi-signature session is not completed');
            }

            // Create aggregated signature object
            const aggregatedSignature = {
                type: 'multi-signature',
                algorithm: 'EdDSA-Multi',
                sessionId: session.sessionId,
                documentId: session.documentId,
                documentHash: session.documentHash,
                threshold: session.threshold,
                signatures: session.signatures.map(sig => ({
                    signer: {
                        role: sig.signer.role,
                        name: sig.signer.name,
                        publicKey: sig.signer.publicKey
                    },
                    signature: sig.signature,
                    signedAt: sig.signedAt
                })),
                metadata: {
                    totalSigners: session.signatures.length,
                    completedAt: session.completedAt,
                    version: '1.0'
                },
                verification: {
                    verified: false,
                    verifiedAt: null
                }
            };

            return aggregatedSignature;
        } catch (error) {
            throw new Error(`Failed to create aggregated signature: ${error.message}`);
        }
    }

    /**
     * Validate multi-signature configuration
     * @param {Array} signers - Array of signers
     * @param {number} threshold - Signature threshold
     * @returns {Object} Validation result
     */
    validateMultiSigConfig(signers, threshold) {
        const errors = [];

        if (!Array.isArray(signers) || signers.length === 0) {
            errors.push('At least one signer is required');
        }

        if (signers.length > this.config.MAX_SIGNERS) {
            errors.push(`Maximum ${this.config.MAX_SIGNERS} signers allowed`);
        }

        if (threshold < this.config.MIN_SIGNERS) {
            errors.push(`Minimum threshold is ${this.config.MIN_SIGNERS}`);
        }

        if (threshold > signers.length) {
            errors.push('Threshold cannot exceed number of signers');
        }

        // Check for duplicate roles
        const roles = signers.map(s => s.role);
        const duplicateRoles = roles.filter((role, index) => roles.indexOf(role) !== index);
        if (duplicateRoles.length > 0) {
            errors.push(`Duplicate signer roles found: ${duplicateRoles.join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
}

module.exports = MultiSignatureService;
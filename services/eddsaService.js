const nacl = require('tweetnacl');
const crypto = require('crypto');
const config = require('../config/config');

class EdDSAService {
    constructor() {
        this.config = config.EDDSA_CONFIG;
    }

    /**
     * Generate EdDSA key pair
     * @returns {Object} Contains publicKey and privateKey as base64 strings
     */
    generateKeyPair() {
        try {
            const keyPair = nacl.sign.keyPair();
            
            return {
                publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
                privateKey: Buffer.from(keyPair.secretKey).toString('base64'),
                keyType: 'ed25519',
                generated: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to generate key pair: ${error.message}`);
        }
    }

    /**
     * Generate key pair for specific signer role
     * @param {string} role - Signer role (dosen, kaprodi, dekan, etc.)
     * @param {string} name - Signer name
     * @param {string} email - Signer email
     * @returns {Object} Key pair with metadata
     */
    generateSignerKeyPair(role, name, email) {
        try {
            const keyPair = this.generateKeyPair();
            
            return {
                ...keyPair,
                signer: {
                    role: role,
                    name: name,
                    email: email,
                    id: crypto.randomUUID()
                },
                metadata: {
                    algorithm: 'Ed25519',
                    keyLength: this.config.PUBLIC_KEY_LENGTH,
                    created: new Date().toISOString(),
                    status: 'active'
                }
            };
        } catch (error) {
            throw new Error(`Failed to generate signer key pair: ${error.message}`);
        }
    }

    /**
     * Create hash of document content
     * @param {string|Buffer} content - Document content
     * @returns {string} SHA-256 hash as hex string
     */
    hashDocument(content) {
        try {
            const hash = crypto.createHash('sha256');
            hash.update(content);
            return hash.digest('hex');
        } catch (error) {
            throw new Error(`Failed to hash document: ${error.message}`);
        }
    }

    /**
     * Create EdDSA signature
     * @param {string} message - Message to sign (usually document hash)
     * @param {string} privateKey - Private key as base64 string
     * @returns {Object} Signature with metadata
     */
    sign(message, privateKey) {
        try {
            const messageBytes = Buffer.from(message, 'utf8');
            const privateKeyBytes = Buffer.from(privateKey, 'base64');
            
            const signature = nacl.sign.detached(messageBytes, privateKeyBytes);
            
            return {
                signature: Buffer.from(signature).toString('base64'),
                message: message,
                algorithm: 'Ed25519',
                timestamp: new Date().toISOString(),
                messageHash: this.hashDocument(message)
            };
        } catch (error) {
            throw new Error(`Failed to create signature: ${error.message}`);
        }
    }

    /**
     * Verify EdDSA signature
     * @param {string} signature - Signature as base64 string
     * @param {string} message - Original message
     * @param {string} publicKey - Public key as base64 string
     * @returns {boolean} Verification result
     */
    verify(signature, message, publicKey) {
        try {
            const signatureBytes = Buffer.from(signature, 'base64');
            const messageBytes = Buffer.from(message, 'utf8');
            const publicKeyBytes = Buffer.from(publicKey, 'base64');
            
            return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        } catch (error) {
            throw new Error(`Failed to verify signature: ${error.message}`);
        }
    }

    /**
     * Create document signature with metadata
     * @param {Object} document - Document object
     * @param {string} privateKey - Signer's private key
     * @param {Object} signerInfo - Signer information
     * @returns {Object} Complete signature object
     */
    signDocument(document, privateKey, signerInfo) {
        try {
            // Create document hash
            const documentContent = JSON.stringify(document.content || document);
            const documentHash = this.hashDocument(documentContent);
            
            // Create signature
            const signatureData = this.sign(documentHash, privateKey);
            
            return {
                documentId: document.id || crypto.randomUUID(),
                documentHash: documentHash,
                signature: signatureData.signature,
                signer: {
                    ...signerInfo,
                    publicKey: this.getPublicKeyFromPrivate(privateKey)
                },
                metadata: {
                    algorithm: 'Ed25519',
                    signedAt: new Date().toISOString(),
                    version: '1.0'
                },
                verification: {
                    verified: false,
                    verifiedAt: null
                }
            };
        } catch (error) {
            throw new Error(`Failed to sign document: ${error.message}`);
        }
    }

    /**
     * Verify document signature
     * @param {Object} signatureObject - Signature object from signDocument
     * @param {Object} document - Original document
     * @returns {Object} Verification result with details
     */
    verifyDocumentSignature(signatureObject, document) {
        try {
            // Recreate document hash
            const documentContent = JSON.stringify(document.content || document);
            const documentHash = this.hashDocument(documentContent);
            
            // Check if document hash matches
            if (documentHash !== signatureObject.documentHash) {
                return {
                    valid: false,
                    reason: 'Document has been modified',
                    documentHashMatch: false,
                    signatureValid: false
                };
            }
            
            // Verify signature
            const isSignatureValid = this.verify(
                signatureObject.signature,
                documentHash,
                signatureObject.signer.publicKey
            );
            
            return {
                valid: isSignatureValid,
                reason: isSignatureValid ? 'Signature is valid' : 'Invalid signature',
                documentHashMatch: true,
                signatureValid: isSignatureValid,
                signer: signatureObject.signer,
                signedAt: signatureObject.metadata.signedAt,
                verifiedAt: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to verify document signature: ${error.message}`);
        }
    }

    /**
     * Extract public key from private key (for Ed25519)
     * @param {string} privateKey - Private key as base64 string
     * @returns {string} Public key as base64 string
     */
    getPublicKeyFromPrivate(privateKey) {
        try {
            const privateKeyBytes = Buffer.from(privateKey, 'base64');
            const keyPair = nacl.sign.keyPair.fromSecretKey(privateKeyBytes);
            return Buffer.from(keyPair.publicKey).toString('base64');
        } catch (error) {
            throw new Error(`Failed to extract public key: ${error.message}`);
        }
    }

    /**
     * Validate key pair
     * @param {string} publicKey - Public key as base64
     * @param {string} privateKey - Private key as base64
     * @returns {boolean} Validation result
     */
    validateKeyPair(publicKey, privateKey) {
        try {
            const testMessage = 'test-message-for-validation';
            const signature = this.sign(testMessage, privateKey);
            return this.verify(signature.signature, testMessage, publicKey);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get algorithm information
     * @returns {Object} Algorithm details
     */
    getAlgorithmInfo() {
        return {
            name: 'EdDSA (Ed25519)',
            curve: 'Curve25519',
            hashFunction: 'SHA-512 (internal)',
            keySize: '256 bits',
            signatureSize: '512 bits',
            securityLevel: '128 bits',
            features: [
                'Deterministic signatures',
                'Fast verification',
                'Small signatures',
                'Immunity to side-channel attacks'
            ]
        };
    }
}

module.exports = EdDSAService;
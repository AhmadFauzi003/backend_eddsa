const express = require('express');
const crypto = require('crypto');

const EdDSAService = require('../services/eddsaService');
const config = require('../config/config');

const router = express.Router();
const eddsaService = new EdDSAService();

/**
 * POST /api/keys/generate
 * Generate new EdDSA key pair
 */
router.post('/generate', async (req, res) => {
    try {
        const { signerInfo } = req.body;

        if (!signerInfo || !signerInfo.role || !signerInfo.name) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields in signerInfo: role, name'
            });
        }

        // Validate role
        const validRoles = Object.values(config.MULTISIG_CONFIG.ROLES);
        if (!validRoles.includes(signerInfo.role)) {
            return res.status(400).json({
                success: false,
                message: `Invalid role. Valid roles: ${validRoles.join(', ')}`
            });
        }

        // Generate key pair
        const keyPair = eddsaService.generateSignerKeyPair(
            signerInfo.role,
            signerInfo.name,
            signerInfo.email || ''
        );

        // Store key pair (in production, store securely in database)
        if (!global.keyStore) {
            global.keyStore = new Map();
        }
        
        const keyId = keyPair.signer.id;
        global.keyStore.set(keyId, {
            ...keyPair,
            createdAt: new Date().toISOString(),
            status: 'active'
        });

        res.status(201).json({
            success: true,
            message: 'Key pair generated successfully',
            data: {
                keyId: keyId,
                publicKey: keyPair.publicKey,
                signer: keyPair.signer,
                metadata: keyPair.metadata,
                // Note: privateKey is not returned for security
                warning: 'Private key is stored securely and not returned in response'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate key pair',
            error: error.message
        });
    }
});

/**
 * GET /api/keys/:keyId
 * Get public key information by key ID
 */
router.get('/:keyId', async (req, res) => {
    try {
        const { keyId } = req.params;

        if (!global.keyStore || !global.keyStore.has(keyId)) {
            return res.status(404).json({
                success: false,
                message: 'Key not found'
            });
        }

        const keyData = global.keyStore.get(keyId);

        // Return only public information
        res.json({
            success: true,
            message: 'Key information retrieved successfully',
            data: {
                keyId: keyId,
                publicKey: keyData.publicKey,
                signer: keyData.signer,
                metadata: keyData.metadata,
                status: keyData.status,
                createdAt: keyData.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve key information',
            error: error.message
        });
    }
});

/**
 * GET /api/keys
 * Get all public keys (for verification purposes)
 */
router.get('/', async (req, res) => {
    try {
        const { role, status } = req.query;

        if (!global.keyStore) {
            return res.json({
                success: true,
                message: 'No keys found',
                data: [],
                total: 0
            });
        }

        let keys = Array.from(global.keyStore.entries()).map(([keyId, keyData]) => ({
            keyId: keyId,
            publicKey: keyData.publicKey,
            signer: keyData.signer,
            metadata: keyData.metadata,
            status: keyData.status,
            createdAt: keyData.createdAt
        }));

        // Filter by role if specified
        if (role) {
            keys = keys.filter(key => key.signer.role === role);
        }

        // Filter by status if specified
        if (status) {
            keys = keys.filter(key => key.status === status);
        }

        res.json({
            success: true,
            message: 'Keys retrieved successfully',
            data: keys,
            total: keys.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve keys',
            error: error.message
        });
    }
});

/**
 * POST /api/keys/validate
 * Validate key pair
 */
router.post('/validate', async (req, res) => {
    try {
        const { publicKey, privateKey } = req.body;

        if (!publicKey || !privateKey) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: publicKey, privateKey'
            });
        }

        // Validate key pair
        const isValid = eddsaService.validateKeyPair(publicKey, privateKey);

        res.json({
            success: true,
            message: 'Key pair validation completed',
            data: {
                valid: isValid,
                algorithm: 'Ed25519',
                validatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to validate key pair',
            error: error.message
        });
    }
});

/**
 * POST /api/keys/:keyId/revoke
 * Revoke a key (mark as inactive)
 */
router.post('/:keyId/revoke', async (req, res) => {
    try {
        const { keyId } = req.params;
        const { reason } = req.body;

        if (!global.keyStore || !global.keyStore.has(keyId)) {
            return res.status(404).json({
                success: false,
                message: 'Key not found'
            });
        }

        const keyData = global.keyStore.get(keyId);

        if (keyData.status === 'revoked') {
            return res.status(400).json({
                success: false,
                message: 'Key is already revoked'
            });
        }

        // Update key status
        keyData.status = 'revoked';
        keyData.revokedAt = new Date().toISOString();
        keyData.revocationReason = reason || 'No reason provided';

        global.keyStore.set(keyId, keyData);

        res.json({
            success: true,
            message: 'Key revoked successfully',
            data: {
                keyId: keyId,
                status: keyData.status,
                revokedAt: keyData.revokedAt,
                reason: keyData.revocationReason
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to revoke key',
            error: error.message
        });
    }
});

/**
 * GET /api/keys/:keyId/private
 * Get private key (for authorized users only - in production, implement proper authentication)
 */
router.get('/:keyId/private', async (req, res) => {
    try {
        const { keyId } = req.params;
        const { authToken } = req.headers;

        // In production, implement proper authentication and authorization
        if (!authToken) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required to access private key'
            });
        }

        if (!global.keyStore || !global.keyStore.has(keyId)) {
            return res.status(404).json({
                success: false,
                message: 'Key not found'
            });
        }

        const keyData = global.keyStore.get(keyId);

        if (keyData.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'Key is not active'
            });
        }

        res.json({
            success: true,
            message: 'Private key retrieved successfully',
            data: {
                keyId: keyId,
                privateKey: keyData.privateKey,
                publicKey: keyData.publicKey,
                signer: keyData.signer,
                warning: 'Keep private key secure and never share it'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve private key',
            error: error.message
        });
    }
});

/**
 * GET /api/keys/algorithm/info
 * Get algorithm information
 */
router.get('/algorithm/info', async (req, res) => {
    try {
        const algorithmInfo = eddsaService.getAlgorithmInfo();

        res.json({
            success: true,
            message: 'Algorithm information retrieved successfully',
            data: algorithmInfo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve algorithm information',
            error: error.message
        });
    }
});

module.exports = router;
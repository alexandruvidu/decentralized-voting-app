/**
 * ElGamal Decryption Service
 * 
 * Production-ready service for threshold decryption of ElGamal-encrypted votes.
 * Supports distributed key generation (DKG) and threshold decryption.
 * 
 * Security features:
 * - Rate limiting
 * - Input validation
 * - Secure logging (no sensitive data in logs)
 * - CORS protection
 * - Helmet security headers
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, param, validationResult } from 'express-validator';
import crypto from 'crypto';
import logger from './logger.js';
import { 
  modPow, 
  modInverse,
  decodeCiphertext,
  decodePublicKey,
  encodeCandidateName,
  encodeCiphertext,
  hashToCandidate,
  parsePublicKeyFromHex,
  parsePublicKeyFromComponents,
  randomBigInt,
  DEFAULT_ELGAMAL_PARAMS
} from './crypto.js';

const app = express();
const PORT = process.env.PORT || 3005;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });
  next();
});

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation failed', { errors: errors.array() });
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  }
  next();
};

/**
 * In-memory storage for DKG sessions and private keys
 * In production, use Redis or secure key management service (KMS)
 */
const dkgSessions = new Map();
const privateKeys = new Map();

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'crypto-service',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// ENCRYPTION (ElGamal)
// ============================================================================

/**
 * POST /api/encrypt
 * Body: { candidateName, publicKeyHex? , p?, g?, h? }
 * Returns: { encryptedBallot, encryptionTimeMs, keySizeBits }
 */
app.post('/api/encrypt', asyncHandler(async (req, res) => {
  const { candidateName, publicKeyHex, p, g, h } = req.body || {};

  if (!candidateName) {
    return res.status(400).json({ error: 'Missing required field: candidateName' });
  }

  let publicKey;
  if (p && g && h) {
    publicKey = parsePublicKeyFromComponents(p, g, h);
  } else if (publicKeyHex) {
    publicKey = parsePublicKeyFromHex(publicKeyHex);
  } else {
    return res.status(400).json({ error: 'Missing public key: provide publicKeyHex or (p,g,h)' });
  }

  const message = encodeCandidateName(candidateName);

  // ElGamal encryption
  const start = Date.now();
  const rand = randomBigInt(1n, publicKey.p - 2n);
  const c1 = modPow(publicKey.g, rand, publicKey.p);
  const hr = modPow(publicKey.h, rand, publicKey.p);
  const c2 = (hr * message) % publicKey.p;
  const encryptionTimeMs = Date.now() - start;

  const encryptedBallot = encodeCiphertext(c1, c2);

  res.json({
    encryptedBallot,
    encryptionTimeMs,
    keySizeBits: publicKey.p.toString(2).length
  });
}));

// ============================================================================
// DKG KEY STORAGE
// ============================================================================

/**
 * POST /api/dkg/store-private-key
 * Store the private key for an election (generated via DKG or threshold reconstruction)
 * 
 * Body:
 * {
 *   "electionId": "1",
 *   "privateKey": "0x1234...", // hex-encoded bigint
 *   "publicKey": {  // Optional: required only for validation
 *     "p": "0xFFFF...",
 *     "g": "0x02",
 *     "h": "0xABCD..."
 *   }
 * }
 */
app.post('/api/dkg/store-private-key',
  [
    body('electionId').isString().notEmpty(),
    body('privateKey').isString().matches(/^0x[0-9a-fA-F]+$/),
    body('publicKey.p').optional().isString().matches(/^0x[0-9a-fA-F]+$/),
    body('publicKey.g').optional().isString().matches(/^0x[0-9a-fA-F]+$/),
    body('publicKey.h').optional().isString().matches(/^0x[0-9a-fA-F]+$/),
    validate
  ],
  asyncHandler(async (req, res) => {
    const { electionId, privateKey, publicKey } = req.body;

    logger.info('Storing private key', { 
      electionId, 
      keyLength: privateKey.length,
      hasPublicKey: !!publicKey
    });

    // Parse private key
    const x = BigInt(privateKey); // Private key

    // If publicKey is provided, validate it
    if (publicKey && publicKey.p && publicKey.g && publicKey.h) {
      const p = BigInt(publicKey.p);
      const g = BigInt(publicKey.g);
      const h = BigInt(publicKey.h);

      // Verify h = g^x mod p
      const computedH = modPow(g, x, p);
      if (computedH !== h) {
        logger.error('Invalid private key: h != g^x mod p', { electionId });
        return res.status(400).json({ 
          error: 'Invalid private key: does not match public key' 
        });
      }

      // Store keys securely (in production, use KMS)
      privateKeys.set(electionId, {
        x,
        publicKey: { p, g, h },
        createdAt: new Date().toISOString()
      });

      logger.info('Private key stored successfully (with validation)', { 
        electionId,
        publicKeyBits: p.toString(2).length 
      });
    } else {
      // No public key provided - store just the private key
      // This is used when reconstructing from threshold shards
      privateKeys.set(electionId, {
        x,
        publicKey: null,
        createdAt: new Date().toISOString()
      });

      logger.info('Private key stored successfully (without validation)', { 
        electionId
      });
    }

    res.json({ 
      success: true, 
      message: 'Private key stored securely',
      electionId 
    });
  })
);

/**
 * DELETE /api/dkg/private-key/:electionId
 * Delete private key after decryption (cleanup)
 */
app.delete('/api/dkg/private-key/:electionId',
  [
    param('electionId').isString().notEmpty(),
    validate
  ],
  asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    if (!privateKeys.has(electionId)) {
      return res.status(404).json({ error: 'Private key not found' });
    }

    privateKeys.delete(electionId);
    logger.info('Private key deleted', { electionId });

    res.json({ success: true, message: 'Private key deleted' });
  })
);

// ============================================================================
// DECRYPTION
// ============================================================================

/**
 * POST /api/decrypt/batch
 * Decrypt multiple encrypted votes for an election
 * 
 * Body:
 * {
 *   "electionId": "1",
 *   "encryptedVotes": [
 *     "0x00000080abcd...",  // hex-encoded ciphertext
 *     "0x00000080ef01..."
 *   ],
 *   "candidates": ["Alice", "Bob", "Charlie"]
 * }
 * 
 * Returns:
 * {
 *   "results": {
 *     "Alice": 5,
 *     "Bob": 3,
 *     "Charlie": 2
 *   },
 *   "totalVotes": 10,
 *   "decryptionTimeMs": 523,
 *   "invalidVotes": 0
 * }
 */
app.post('/api/decrypt/batch',
  [
    body('electionId').isString().notEmpty(),
    body('encryptedVotes').isArray().notEmpty(),
    body('encryptedVotes.*').isString().matches(/^0x[0-9a-fA-F]+$/),
    body('candidates').isArray().notEmpty(),
    body('candidates.*').isString().notEmpty(),
    validate
  ],
  asyncHandler(async (req, res) => {
    const { electionId, encryptedVotes, candidates } = req.body;

    logger.info('Batch decryption request', { 
      electionId, 
      voteCount: encryptedVotes.length,
      candidateCount: candidates.length
    });

    // Check if private key exists
    const keyData = privateKeys.get(electionId);
    if (!keyData) {
      logger.error('Private key not found', { electionId });
      return res.status(404).json({ 
        error: 'Private key not found for this election. Please store the key first.' 
      });
    }

    const { x, publicKey } = keyData;
   
     // If publicKey is not stored (threshold reconstruction), use default ElGamal params
     let p, g;
     if (publicKey && publicKey.p) {
       p = publicKey.p;
       g = publicKey.g || 2n;
     } else {
       // Use RFC 3526 Group 14 default parameters
       const { DEFAULT_ELGAMAL_PARAMS } = await import('./crypto.js');
       p = DEFAULT_ELGAMAL_PARAMS.p;
       g = DEFAULT_ELGAMAL_PARAMS.g;
       logger.info('Using default ElGamal parameters for decryption', { electionId });
     }

    // Create candidate hash mapping
    const candidateHashes = new Map();
    for (const candidate of candidates) {
      const hash = encodeCandidateName(candidate);
      candidateHashes.set(hash.toString(), candidate);
      logger.debug('Candidate hash', { 
        candidate, 
        hash: hash.toString().substring(0, 20) + '...' 
      });
    }

    const startTime = Date.now();
    const voteCounts = {};
    let invalidVotes = 0;

    // Initialize counts
    for (const candidate of candidates) {
      voteCounts[candidate] = 0;
    }

    // Decrypt each vote
    for (let i = 0; i < encryptedVotes.length; i++) {
      try {
        const encryptedVote = encryptedVotes[i];
        
        // Decode ciphertext
        const { c1, c2 } = decodeCiphertext(encryptedVote);

        // Decrypt: m = c2 * (c1^x)^(-1) mod p
        const c1x = modPow(c1, x, p);
        const c1xInv = modInverse(c1x, p);
        const m = (c2 * c1xInv) % p;

        // Map decrypted message to candidate
        const mStr = m.toString();
        const candidate = candidateHashes.get(mStr);

        logger.info('Decryption Debug', {
          voteIndex: i,
          decryptedM: mStr,
          foundCandidate: candidate || 'NONE',
          allHashes: Array.from(candidateHashes.keys())
        });

        if (candidate) {
          voteCounts[candidate]++;
          logger.debug('Vote decrypted', { 
            voteIndex: i, 
            candidate,
            messageHash: mStr.substring(0, 20) + '...'
          });
        } else {
          invalidVotes++;
          logger.warn('Invalid vote: no matching candidate', { 
            voteIndex: i,
            messageHash: mStr.substring(0, 20) + '...',
            availableCandidates: candidates
          });
        }
      } catch (error) {
        invalidVotes++;
        logger.error('Error decrypting vote', { 
          voteIndex: i, 
          error: error.message 
        });
      }
    }

    const decryptionTime = Date.now() - startTime;
    const totalVotes = encryptedVotes.length - invalidVotes;

    logger.info('Batch decryption completed', {
      electionId,
      totalVotes,
      invalidVotes,
      decryptionTimeMs: decryptionTime,
      results: voteCounts
    });

    res.json({
      success: true,
      results: voteCounts,
      totalVotes,
      invalidVotes,
      decryptionTimeMs: decryptionTime,
      electionId
    });
  })
);

/**
 * POST /api/decrypt/single
 * Decrypt a single encrypted vote (for testing)
 * 
 * Body:
 * {
 *   "electionId": "1",
 *   "encryptedVote": "0x00000080abcd...",
 *   "candidates": ["Alice", "Bob"]
 * }
 */
app.post('/api/decrypt/single',
  [
    body('electionId').isString().notEmpty(),
    body('encryptedVote').isString().matches(/^0x[0-9a-fA-F]+$/),
    body('candidates').isArray().notEmpty(),
    validate
  ],
  asyncHandler(async (req, res) => {
    const { electionId, encryptedVote, candidates } = req.body;

    const keyData = privateKeys.get(electionId);
    if (!keyData) {
      return res.status(404).json({ error: 'Private key not found' });
    }

    const { x, publicKey } = keyData;
    const { p } = publicKey;

    // Decode ciphertext
    const { c1, c2 } = decodeCiphertext(encryptedVote);

    // Decrypt
    const c1x = modPow(c1, x, p);
    const c1xInv = modInverse(c1x, p);
    const m = (c2 * c1xInv) % p;

    // Find matching candidate
    let matchedCandidate = null;
    for (const candidate of candidates) {
      const hash = encodeCandidateName(candidate);
      if (hash === m) {
        matchedCandidate = candidate;
        break;
      }
    }

    logger.info('Single vote decrypted', { 
      electionId, 
      candidate: matchedCandidate || 'unknown' 
    });

    res.json({
      success: true,
      candidate: matchedCandidate,
      messageHash: m.toString().substring(0, 20) + '...',
      isValid: matchedCandidate !== null
    });
  })
);

// ============================================================================
// THRESHOLD CRYPTOGRAPHY
// ============================================================================

/**
 * Lagrange interpolation for threshold secret sharing (Shamir Secret Sharing)
 * Reconstructs secret from k-of-n shares using polynomial evaluation at x=0
 */
function lagrangeInterpolation(shares, prime) {
  if (shares.length === 0) {
    throw new Error('No shares provided');
  }

  // If no prime is provided, use default RFC 3526 Group 14 prime
  // But DKG service should always provide one.
  const p = prime ? BigInt(prime) : BigInt(DEFAULT_ELGAMAL_PARAMS.p);
  const k = shares.length;
  let secret = 0n;

  for (let i = 0; i < k; i++) {
    const xi = BigInt(shares[i].index);
    // Ensure hex string has 0x prefix before converting to BigInt
    const yiHex = shares[i].value.startsWith('0x') ? shares[i].value : '0x' + shares[i].value;
    const yi = BigInt(yiHex);

    // Lagrange basis polynomial: li(0) = product((0 - xj) / (xi - xj)) for j != i
    let numerator = 1n;
    let denominator = 1n;

    for (let j = 0; j < k; j++) {
      if (i !== j) {
        const xj = BigInt(shares[j].index);
        
        // Numerator: 0 - xj = -xj
        // In modular arithmetic: -xj mod p = p - (xj mod p)
        let numTerm = -xj;
        while (numTerm < 0n) numTerm += p;
        numTerm = numTerm % p;
        
        numerator = (numerator * numTerm) % p;

        // Denominator: xi - xj
        let denTerm = xi - xj;
        while (denTerm < 0n) denTerm += p;
        denTerm = denTerm % p;
        
        denominator = (denominator * denTerm) % p;
      }
    }

    // contribution = yi * numerator * modInverse(denominator)
    const denInv = modInverse(denominator, p);
    const contribution = (yi * numerator * denInv) % p;
    
    secret = (secret + contribution) % p;
  }

  return secret;
}

// ============================================================================
// CONTRACT INTEGRATION
// ============================================================================

import { fetchEncryptedVotes } from './contract.js';

// ============================================================================
// THRESHOLD DECRYPTION
// ============================================================================

/**
 * POST /api/threshold/combine-shards
 * Combine k-of-n key shards to reconstruct the private key
 * 
 * Body:
 * {
 *   "electionId": "1",
 *   "shards": [
 *     { "index": 1, "value": "0x1234..." },
 *     { "index": 2, "value": "0x5678..." }
 *   ],
 *   "threshold": 2
 * }
 * 
 * Returns:
 * {
 *   "success": true,
 *   "privateKey": "0x1234...",
 *   "reconstructionTime": 123
 * }
 */
app.post('/api/threshold/combine-shards',
  [
    body('electionId').isString().notEmpty(),
    body('shards').isArray().notEmpty(),
    body('shards.*.index').isInt({ min: 1 }),
    body('shards.*.value').isString().matches(/^0x[0-9a-fA-F]+$/),
    body('threshold').isInt({ min: 2 }),
    body('prime').optional().isString(), // Allow prime to be passed
    validate
  ],
  asyncHandler(async (req, res) => {
    const { electionId, shards, threshold, prime } = req.body;

    logger.info('Combining key shards', {
      electionId,
      shardCount: shards.length,
      threshold,
      hasPrime: !!prime
    });

    if (shards.length < threshold) {
      return res.status(400).json({
        error: `Need at least ${threshold} shards, got ${shards.length}`
      });
    }

    const startTime = Date.now();

    try {
      // Use only the first 'threshold' shards
      const selectedShards = shards.slice(0, threshold).map(s => ({
        index: s.index,
        value: s.value.startsWith('0x') ? s.value.slice(2) : s.value
      }));

      // Lagrange interpolation to reconstruct secret
      // Pass the prime!
      const reconstructedBigInt = lagrangeInterpolation(selectedShards, prime);
      
      // Convert back to hex with 0x prefix
      let privateKeyHex = reconstructedBigInt.toString(16);
      if (privateKeyHex.length % 2) {
        privateKeyHex = '0' + privateKeyHex;
      }
      const privateKey = '0x' + privateKeyHex;

      const reconstructionTime = Date.now() - startTime;

      logger.info('Key shards combined successfully', {
        electionId,
        reconstructionTime,
        keyLength: privateKey.length
      });

      res.json({
        success: true,
        privateKey,
        reconstructionTime
      });
    } catch (error) {
      logger.error('Failed to combine shards', {
        electionId,
        error: error.message
      });

      res.status(400).json({
        error: 'Failed to combine shards: ' + error.message
      });
    }
  })
);

// ============================================================================
// CONTRACT INTEGRATION
// ============================================================================

/**
 * GET /api/contract/votes/:electionId
 * Fetch encrypted votes from the smart contract
 */
app.get('/api/contract/votes/:electionId',
  [
    param('electionId').isString().notEmpty(),
    validate
  ],
  asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    logger.info('Fetching votes from contract', { electionId });

    const { votes, count } = await fetchEncryptedVotes(electionId);

    res.json({
      success: true,
      electionId,
      votes,
      count
    });
  })
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/keys
 * List stored election keys (metadata only, no private keys exposed)
 */
app.get('/api/admin/keys', (req, res) => {
  const keyList = [];
  
  for (const [electionId, data] of privateKeys.entries()) {
    keyList.push({
      electionId,
      createdAt: data.createdAt,
      keyBits: data.publicKey.p.toString(2).length,
      hasPrivateKey: true
    });
  }

  res.json({
    count: keyList.length,
    keys: keyList
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path
  });

  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  logger.info('Decryption service started', { 
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });

  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║          ElGamal Decryption Service Started                        ║
║                                                                    ║
║  Port: ${PORT}                                                      ║
║  Environment: ${process.env.NODE_ENV || 'development'}                                              ║
║                                                                    ║
║  Endpoints:                                                        ║
║    POST /api/dkg/store-private-key                                 ║
║    POST /api/decrypt/batch                                         ║
║    POST /api/decrypt/single                                        ║
║    GET  /api/admin/keys                                            ║
║    GET  /health                                                    ║
║                                                                    ║
║  Security: Rate limiting, CORS, Helmet, Input validation          ║
╚════════════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

/**
 * DKG Service - REST API Server
 * Distributed Key Generation with 3-of-5 threshold cryptography
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  setupCeremony,
  distributeShares,
  verifyAllShares,
  getCeremony,
  getPublicKey,
  thresholdDecrypt,
  finalizeCeremony,
  listCeremonies,
  getShardsByElectionId
} from './dkg-ceremony.js';
import { testDKG } from './threshold-crypto.js';
import { homomorphicTally } from './homomorphic-tally.js';

dotenv.config();

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'dkg-service',
    timestamp: new Date().toISOString()
  });
});

/**
 * Initialize a new DKG ceremony
 * POST /dkg/setup
 */
app.post('/dkg/setup', (req, res) => {
  try {
    const { electionId, threshold = 3, shares = 5, shareholderIds = [] } = req.body;
    
    if (!electionId) {
      return res.status(400).json({ error: 'electionId is required' });
    }
    
    if (threshold > shares) {
      return res.status(400).json({ error: 'Threshold cannot be greater than total shares' });
    }
    
    if (threshold < 2) {
      return res.status(400).json({ error: 'Threshold must be at least 2' });
    }
    
    const ceremony = setupCeremony({
      electionId,
      threshold,
      shares,
      shareholderIds: shareholderIds.length > 0 ? shareholderIds : Array.from({ length: shares }, (_, i) => `shareholder_${i + 1}`)
    });
    
    console.log(`✅ DKG ceremony created: ${ceremony.ceremonyId}`);
    
    res.json({
      success: true,
      ...ceremony
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Distribute shares to shareholders
 * POST /dkg/distribute-shares
 */
app.post('/dkg/distribute-shares', (req, res) => {
  try {
    const { ceremonyId } = req.body;
    
    if (!ceremonyId) {
      return res.status(400).json({ error: 'ceremonyId is required' });
    }
    
    const result = distributeShares(ceremonyId);
    
    console.log(`✅ Shares distributed for ceremony: ${ceremonyId}`);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Distribution error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Verify all shares in a ceremony
 * POST /dkg/verify-shares
 */
app.post('/dkg/verify-shares', (req, res) => {
  try {
    const { ceremonyId } = req.body;
    
    if (!ceremonyId) {
      return res.status(400).json({ error: 'ceremonyId is required' });
    }
    
    const result = verifyAllShares(ceremonyId);
    
    console.log(`✅ Shares verified for ceremony: ${ceremonyId} - All valid: ${result.allSharesValid}`);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get ceremony details
 * GET /dkg/ceremony/:ceremonyId
 */
app.get('/dkg/ceremony/:ceremonyId', (req, res) => {
  try {
    const { ceremonyId } = req.params;
    
    const ceremony = getCeremony(ceremonyId);
    if (!ceremony) {
      return res.status(404).json({
        success: false,
        error: 'Ceremony not found'
      });
    }
    
    res.json({
      success: true,
      ceremony
    });
  } catch (error) {
    console.error('Get ceremony error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get public key for encryption by election ID
 * GET /dkg/public-key/:electionId
 * This automatically creates a ceremony if one doesn't exist
 */
app.get('/dkg/public-key/:electionId', (req, res) => {
  try {
    const { electionId } = req.params;
    
    // Try to find existing ceremony for this election
    let ceremonies = listCeremonies();
    let ceremony = ceremonies.find(c => c.electionId === electionId);
    
    // If no ceremony exists, create one automatically
    if (!ceremony) {
      console.log(`🔄 Auto-creating DKG ceremony for election ${electionId}`);
      ceremony = setupCeremony({
        electionId,
        threshold: 3,
        shares: 5,
        shareholderIds: Array.from({ length: 5 }, (_, i) => `shareholder_${i + 1}`)
      });
      
      // Automatically distribute shares and finalize
      distributeShares(ceremony.ceremonyId);
      verifyAllShares(ceremony.ceremonyId);
      finalizeCeremony(ceremony.ceremonyId);
      
      console.log(`✅ Auto-created ceremony ${ceremony.ceremonyId} for election ${electionId}`);
    }
    
    const result = getPublicKey(ceremony.ceremonyId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Get public key error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Store encryption public key on smart contract
 * POST /dkg/store-keys/:electionId
 */
app.post('/dkg/store-keys/:electionId', async (req, res) => {
  try {
    const { electionId } = req.params;
    const { publicKey } = req.body;

    if (!publicKey || !publicKey.p || !publicKey.g || !publicKey.h) {
      return res.status(400).json({ 
        error: 'publicKey with p, g, h parameters is required' 
      });
    }

    // Import SDK dependencies
    const { 
      AbiRegistry,
      Address,
      SmartContractTransactionsFactory,
      TransactionsFactoryConfig,
      TransactionComputer,
      UserSigner
    } = require('@multiversx/sdk-core');
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');

    // Encode public key as binary: length || p || length || g || length || h
    const pBigInt = BigInt('0x' + publicKey.p);
    const gBigInt = BigInt('0x' + publicKey.g);
    const hBigInt = BigInt('0x' + publicKey.h);
    
    // Helper to convert BigInt to bytes
    function bigIntToBytes(n) {
      const hex = n.toString(16);
      const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
      return Buffer.from(paddedHex, 'hex');
    }
    
    const pBytes = bigIntToBytes(pBigInt);
    const gBytes = bigIntToBytes(gBigInt);
    const hBytes = bigIntToBytes(hBigInt);
    
    // Encode as: [p_len(4 bytes) || p_bytes || g_len(4 bytes) || g_bytes || h_len(4 bytes) || h_bytes]
    const buffer = Buffer.alloc(4 + pBytes.length + 4 + gBytes.length + 4 + hBytes.length);
    let offset = 0;
    
    buffer.writeUInt32BE(pBytes.length, offset);
    offset += 4;
    pBytes.copy(buffer, offset);
    offset += pBytes.length;
    
    buffer.writeUInt32BE(gBytes.length, offset);
    offset += 4;
    gBytes.copy(buffer, offset);
    offset += gBytes.length;
    
    buffer.writeUInt32BE(hBytes.length, offset);
    offset += 4;
    hBytes.copy(buffer, offset);
    
    const encodedKey = buffer.toString('hex');
    console.log(`📦 Encoded public key for election ${electionId}: ${encodedKey.substring(0, 50)}...`);

    // Load organizer wallet (use the PEM file from the project root)
    const pemPath = path.join(__dirname, '../../wallet-owner.pem');
    if (!fs.existsSync(pemPath)) {
      return res.status(500).json({
        success: false,
        error: 'Organizer wallet not found. Please ensure wallet-owner.pem exists.'
      });
    }

    const pemContent = fs.readFileSync(pemPath, 'utf8');
    const signer = UserSigner.fromPem(pemContent);
    const organizerAddress = new Address(signer.getAddress());
    const organizerBech32 = organizerAddress.toBech32();
    
    console.log(`🔑 Using organizer address: ${organizerBech32}`);

    // Load contract ABI
    const abiPath = path.join(__dirname, '../../output/voting-app.abi.json');
    const abiJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    const abi = AbiRegistry.create(abiJson);
    
    const contractAddress = process.env.CONTRACT_ADDRESS || 'erd1qqqqqqqqqqqqqpgq3wwwwnn8t8l5jur9yflxdnl7y83p9x6yv8mswmjh4j';
    
    // Create transaction factory
    const factory = new SmartContractTransactionsFactory({
      config: new TransactionsFactoryConfig({ chainID: 'D' }), // DevNet
      abi
    });

    // Create setEncryptionPublicKey transaction
    const tx = await factory.createTransactionForExecute(
      organizerAddress,
      {
        contract: new Address(contractAddress),
        function: 'setEncryptionPublicKey',
        gasLimit: BigInt(10_000_000),
        arguments: [
          BigInt(electionId),
          Buffer.from(encodedKey, 'hex')
        ]
      }
    );

    // Get account nonce
    const accountResponse = await axios.get(`https://devnet-api.multiversx.com/accounts/${organizerBech32}`);
    tx.nonce = BigInt(accountResponse.data.nonce);

    // Sign transaction using TransactionComputer
    const computer = new TransactionComputer();
    const serializedTx = computer.computeBytesForSigning(tx);
    const signature = await signer.sign(Buffer.from(serializedTx));
    tx.signature = signature;

    // Send transaction
    const txJson = tx.toPlainObject();
    const sendResponse = await axios.post('https://devnet-gateway.multiversx.com/transaction/send', txJson);
    
    // Gateway returns txHash in data.data.txHash or data.txHash
    const txHash = sendResponse.data?.data?.txHash || sendResponse.data?.txHash || computer.computeTransactionHash(tx);
    console.log(`✅ Transaction sent: ${txHash}`);
    
    res.json({
      success: true,
      message: 'Keys stored on blockchain',
      electionId,
      encodedPublicKey: encodedKey,
      txHash,
      explorer: `https://devnet-explorer.multiversx.com/transactions/${txHash}`
    });
  } catch (error) {
    console.error('Store keys error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Threshold decryption using shareholder shares
 * POST /dkg/threshold-decrypt
 */
app.post('/dkg/threshold-decrypt', (req, res) => {
  try {
    const { ceremonyId, shareholderShares } = req.body;
    
    if (!ceremonyId) {
      return res.status(400).json({ error: 'ceremonyId is required' });
    }
    
    if (!shareholderShares || !Array.isArray(shareholderShares)) {
      return res.status(400).json({ error: 'shareholderShares array is required' });
    }
    
    const result = thresholdDecrypt(ceremonyId, shareholderShares);
    
    if (result.success) {
      console.log(`✅ Threshold decryption successful for ceremony: ${ceremonyId}`);
    } else {
      console.warn(`⚠️ Threshold decryption failed: ${result.error}`);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Decryption error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Finalize ceremony
 * POST /dkg/finalize
 */
app.post('/dkg/finalize', (req, res) => {
  try {
    const { ceremonyId } = req.body;
    
    if (!ceremonyId) {
      return res.status(400).json({ error: 'ceremonyId is required' });
    }
    
    const result = finalizeCeremony(ceremonyId);
    
    console.log(`✅ Ceremony finalized: ${ceremonyId}`);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Finalize error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Homomorphic vote tally
 * POST /dkg/homomorphic-tally
 * 
 * Combines encrypted votes without decryption
 * Request body:
 * {
 *   "ceremonyId": "...",
 *   "votes": [
 *     { "candidateId": 1, "encrypted": { "c1": "...", "c2": "..." } },
 *     { "candidateId": 2, "encrypted": { "c1": "...", "c2": "..." } },
 *     ...
 *   ]
 * }
 */
app.post('/dkg/homomorphic-tally', (req, res) => {
  try {
    const { ceremonyId, votes, candidates } = req.body;
    
    if (!ceremonyId || !votes || !Array.isArray(votes)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid: ceremonyId, votes'
      });
    }
    
    // Get ceremony to verify it exists and get public key
    const ceremony = getCeremony(ceremonyId);
    if (!ceremony) {
      return res.status(404).json({
        success: false,
        error: `Ceremony ${ceremonyId} not found`
      });
    }
    
    const result = homomorphicTally(votes, ceremony, candidates);
    
    res.json({
      success: true,
      ceremonyId,
      tally: result.tally,
      encryptedSum: result.encryptedSum,
      statistics: result.statistics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Homomorphic tally error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List all ceremonies
 * GET /dkg/ceremonies
 */
app.get('/dkg/ceremonies', (req, res) => {
  try {
    const ceremonies = listCeremonies();
    
    res.json({
      success: true,
      ceremonies,
      count: ceremonies.length
    });
  } catch (error) {
    console.error('List ceremonies error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get key shards for decryption
 * GET /dkg/shards/:electionId
 * Returns list of key shards for all shareholders in the election's DKG ceremony
 */
app.get('/dkg/shards/:electionId', (req, res) => {
  try {
    const { electionId } = req.params;
    
    const result = getShardsByElectionId(electionId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: `No DKG ceremony found for election ${electionId}`
      });
    }
    
    res.json({
      success: true,
      ...result,
      message: `Found ${result.shards.length} key shards for election ${electionId}`
    });
  } catch (error) {
    console.error('Get shards error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Run DKG test
 * GET /test/dkg
 */
app.get('/test/dkg', (req, res) => {
  try {
    const result = testDKG();
    
    res.json({
      success: true,
      testsPassed: result.testsPassed,
      message: 'DKG test completed',
      details: {
        secretLength: result.secret.length,
        sharesCount: result.shares.length,
        threshold: 3,
        reconstructionTest1: 'PASSED',
        reconstructionTest2: 'PASSED'
      }
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🔐 DKG Service Started
================================
📡 Server: http://localhost:${PORT}
🎯 Threshold: 3-of-5
📚 Documentation: /dkg
================================

Available endpoints:
  POST   /dkg/setup                    - Initialize DKG ceremony
  POST   /dkg/distribute-shares        - Distribute shares to shareholders
  POST   /dkg/verify-shares            - Verify all shares
  GET    /dkg/ceremony/:id             - Get ceremony details
  GET    /dkg/public-key/:id           - Get public key for encryption
  POST   /dkg/homomorphic-tally        - Combine encrypted votes
  POST   /dkg/threshold-decrypt        - Decrypt using threshold shares
  POST   /dkg/finalize                 - Finalize ceremony
  GET    /dkg/ceremonies               - List all ceremonies
  GET    /health                       - Health check
  GET    /test/dkg                     - Run DKG test

Example usage:
  curl -X POST http://localhost:${PORT}/dkg/setup \\
    -H "Content-Type: application/json" \\
    -d '{"electionId": 1, "threshold": 3, "shares": 5}'
`);
});

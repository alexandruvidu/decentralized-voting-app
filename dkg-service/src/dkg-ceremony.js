/**
 * DKG Ceremony Manager
 * Orchestrates the key generation ceremony with distributed shares
 */

import crypto from 'crypto';
import {
  generateShares,
  reconstructSecret,
  createVerificationHash,
  verifyShare
} from './threshold-crypto.js';
import {
  loadCeremonies,
  saveCeremonies
} from './storage.js';

// Current contract address (set via setContractAddress before operations)
let currentContractAddress = null;

// In-memory cache (loaded from disk per contract)
let ceremonies = new Map();

/**
 * Set the current contract address for ceremony operations
 */
export function setContractAddress(contractAddress) {
  if (currentContractAddress !== contractAddress) {
    currentContractAddress = contractAddress;
    // Load ceremonies for this contract
    ceremonies = loadCeremonies(contractAddress);
    console.log(`🔑 Switched to contract: ${contractAddress}`);
  }
}

/**
 * Get current contract address
 */
export function getCurrentContractAddress() {
  return currentContractAddress;
}

/**
 * Persist current ceremonies to disk
 */
function persistCeremonies() {
  if (!currentContractAddress) {
    console.warn('⚠️  No contract address set, skipping persist');
    return;
  }
  saveCeremonies(currentContractAddress, ceremonies);
}

/**
 * Create a new DKG ceremony
 */
export function setupCeremony({
  electionId,
  threshold = 3,
  shares = 5,
  shareholderIds = []
}) {
  // Generate ceremony ID
  const ceremonyId = 'cer_' + crypto.randomBytes(8).toString('hex');
  
  // Generate private key (will be split into shares)
  const privateKey = crypto.randomBytes(32);
  const privateKeyHex = privateKey.toString('hex');
  
  // Generate ElGamal parameters for homomorphic encryption
  // Using safe prime p and generator g
  // In production, use standard cryptographic primes (e.g., RFC 3526)
  const p = 'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF'; // 2048-bit safe prime
  const g = '2'; // Standard generator
  
  // h = g^x mod p where x is the private key
  const pBigInt = BigInt('0x' + p);
  const gBigInt = BigInt(g);
  const xBigInt = BigInt('0x' + privateKeyHex);
  
  // Compute h = g^x mod p using modular exponentiation
  function modExp(base, exp, mod) {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) result = (result * base) % mod;
      exp = exp >> 1n;
      base = (base * base) % mod;
    }
    return result;
  }
  
  const h = modExp(gBigInt, xBigInt, pBigInt);
  
  const publicKey = {
    p: p,
    g: g,
    h: h.toString(16)
  };
  
  // Generate threshold shares
  const { shares: thresholdShares, coefficients, prime } = generateShares(
    privateKeyHex,
    threshold,
    shares
  );
  
  // Map shares to shareholders
  const shareDistribution = {};
  thresholdShares.forEach((share, index) => {
    const shareholderId = shareholderIds[index] || `shareholder_${index + 1}`;
    shareDistribution[shareholderId] = {
      x: share.x,
      yHex: share.yHex,
      verificationHash: createVerificationHash(share),
      received: false,
      timestamp: null
    };
  });
  
  // Store ceremony
  const ceremony = {
    ceremonyId,
    electionId,
    status: 'initialized', // initialized -> distributed -> verified -> finalized
    threshold,
    totalShares: shares,
    publicKey: publicKey,
    privateKey: privateKeyHex, // Store temporarily for distribution
    coefficients,
    prime,
    shareholderIds,
    shareDistribution,
    createdAt: new Date().toISOString(),
    distributedAt: null,
    verifiedAt: null,
    finalizedAt: null
  };
  
  ceremonies.set(ceremonyId, ceremony);
  persistCeremonies();
  
  return {
    ceremonyId,
    publicKey: publicKey,
    threshold,
    totalShares: shares,
    status: 'initialized',
    shareholderCount: shareholderIds.length
  };
}

/**
 * Distribute shares to shareholders
 */
export function distributeShares(ceremonyId) {
  const ceremony = ceremonies.get(ceremonyId);
  if (!ceremony) {
    throw new Error('Ceremony not found: ' + ceremonyId);
  }
  
  if (ceremony.status !== 'initialized') {
    throw new Error(`Cannot distribute shares in ${ceremony.status} state`);
  }
  
  const distribution = [];
  
  for (const [shareholderId, shareData] of Object.entries(ceremony.shareDistribution)) {
    distribution.push({
      shareholderId,
      shareIndex: shareData.x,
      verificationHash: shareData.verificationHash,
      // In production: encrypt share with shareholder's public key
      // For now, include the share data (should be encrypted in real implementation)
      share: shareData.yHex
    });
  }
  
  // Update ceremony status
  ceremony.status = 'distributed';
  ceremony.distributedAt = new Date().toISOString();
  persistCeremonies();
  
  return {
    ceremonyId,
    status: 'distributed',
    distribution,
    message: `Distributed ${distribution.length} shares to shareholders`,
    threshold: ceremony.threshold
  };
}

/**
 * Verify all shares are valid
 */
export function verifyAllShares(ceremonyId) {
  const ceremony = ceremonies.get(ceremonyId);
  if (!ceremony) {
    throw new Error('Ceremony not found: ' + ceremonyId);
  }
  
  let validCount = 0;
  const verificationResults = [];
  
  for (const [shareholderId, shareData] of Object.entries(ceremony.shareDistribution)) {
    const share = {
      x: shareData.x,
      yHex: shareData.yHex
    };
    
    try {
      const isValid = verifyShare(share, ceremony.coefficients, ceremony.prime);
      if (isValid) {
        validCount++;
        verificationResults.push({
          shareholderId,
          valid: true
        });
      } else {
        verificationResults.push({
          shareholderId,
          valid: false,
          error: 'Share does not match polynomial commitment'
        });
      }
    } catch (error) {
      verificationResults.push({
        shareholderId,
        valid: false,
        error: error.message
      });
    }
  }
  
  const allValid = validCount === ceremony.totalShares;
  
  if (allValid) {
    ceremony.status = 'verified';
    ceremony.verifiedAt = new Date().toISOString();
    persistCeremonies();
  }
  
  return {
    ceremonyId,
    status: ceremony.status,
    allSharesValid: allValid,
    validCount,
    totalShares: ceremony.totalShares,
    verificationResults
  };
}

/**
 * Get ceremony details
 */
export function getCeremony(ceremonyId) {
  const ceremony = ceremonies.get(ceremonyId);
  if (!ceremony) {
    return null;
  }
  
  return {
    ceremonyId: ceremony.ceremonyId,
    electionId: ceremony.electionId,
    status: ceremony.status,
    publicKey: ceremony.publicKey,
    threshold: ceremony.threshold,
    totalShares: ceremony.totalShares,
    shareholderCount: ceremony.shareholderIds.length,
    createdAt: ceremony.createdAt,
    distributedAt: ceremony.distributedAt,
    verifiedAt: ceremony.verifiedAt
  };
}

/**
 * Get public key for encryption
 */
export function getPublicKey(ceremonyId) {
  const ceremony = ceremonies.get(ceremonyId);
  if (!ceremony) {
    throw new Error('Ceremony not found: ' + ceremonyId);
  }
  
  if (ceremony.status !== 'verified' && ceremony.status !== 'finalized') {
    throw new Error(`Ceremony must be verified before using public key. Current status: ${ceremony.status}`);
  }
  
  return {
    ceremonyId,
    publicKey: ceremony.publicKey,
    threshold: ceremony.threshold,
    totalShares: ceremony.totalShares,
    electionId: ceremony.electionId
  };
}

/**
 * Perform threshold decryption
 * Combines N shares to reconstruct the private key for decryption
 */
export function thresholdDecrypt(ceremonyId, shareholderShares) {
  const ceremony = ceremonies.get(ceremonyId);
  if (!ceremony) {
    throw new Error('Ceremony not found: ' + ceremonyId);
  }
  
  if (shareholderShares.length < ceremony.threshold) {
    throw new Error(
      `Need at least ${ceremony.threshold} shares to decrypt, got ${shareholderShares.length}`
    );
  }
  
  // Map shareholder shares back to numeric form
  const sharesForReconstruction = shareholderShares.map(({ shareholderId, share }) => {
    const shareData = ceremony.shareDistribution[shareholderId];
    if (!shareData) {
      throw new Error(`Unknown shareholder: ${shareholderId}`);
    }
    
    return {
      x: shareData.x,
      yHex: share,
      y: BigInt(share)
    };
  });
  
  try {
    // Reconstruct the private key from shares
    const reconstructedPrivateKey = reconstructSecret(sharesForReconstruction, ceremony.prime);
    
    if (reconstructedPrivateKey !== ceremony.privateKey) {
      throw new Error('Reconstructed private key does not match original');
    }
    
    return {
      ceremonyId,
      success: true,
      privateKey: reconstructedPrivateKey,
      shareholdersUsed: shareholderShares.length,
      threshold: ceremony.threshold,
      message: `Successfully reconstructed private key using ${shareholderShares.length} shares`
    };
  } catch (error) {
    return {
      ceremonyId,
      success: false,
      error: error.message
    };
  }
}

/**
 * Finalize ceremony (cleanup)
 */
export function finalizeCeremony(ceremonyId) {
  const ceremony = ceremonies.get(ceremonyId);
  if (!ceremony) {
    throw new Error('Ceremony not found: ' + ceremonyId);
  }
  
  // Clear sensitive data (private key should only exist during this window)
  ceremony.privateKey = null;
  ceremony.status = 'finalized';
  ceremony.finalizedAt = new Date().toISOString();
  persistCeremonies();
  
  return {
    ceremonyId,
    status: 'finalized',
    message: 'Ceremony finalized. Shares are now ready for decryption.'
  };
}

/**
 * List all ceremonies
 */
export function listCeremonies() {
  const list = [];
  for (const ceremony of ceremonies.values()) {
    list.push({
      ceremonyId: ceremony.ceremonyId,
      electionId: ceremony.electionId,
      status: ceremony.status,
      threshold: ceremony.threshold,
      totalShares: ceremony.totalShares,
      createdAt: ceremony.createdAt
    });
  }
  return list;
}

/**
 * Get ceremony for testing
 */
export function getCeremonyInternal(ceremonyId) {
  return ceremonies.get(ceremonyId);
}

/**
 * Get key shards for a ceremony by election ID
 */
export function getShardsByElectionId(electionId) {
  const ceremonies_list = [];
  for (const ceremony of ceremonies.values()) {
    if (ceremony.electionId === electionId) {
      ceremonies_list.push(ceremony);
    }
  }
  
  if (ceremonies_list.length === 0) {
    return null;
  }
  
  const ceremony = ceremonies_list[0];
  const shards = [];
  
  if (!ceremony.shareDistribution) {
    return null;
  }
  
  for (const [shareholderId, shareData] of Object.entries(ceremony.shareDistribution)) {
    shards.push({
      shareholderId,
      shareIndex: shareData.x,
      share: shareData.yHex,
      verificationHash: shareData.verificationHash
    });
  }
  
  return {
    ceremonyId: ceremony.ceremonyId,
    electionId: ceremony.electionId,
    threshold: ceremony.threshold,
    prime: ceremony.prime, // Return prime modulus for reconstruction
    publicKey: ceremony.publicKey, // Return full public key parameters
    totalShares: ceremony.totalShares,
    status: ceremony.status,
    shards
  };
}

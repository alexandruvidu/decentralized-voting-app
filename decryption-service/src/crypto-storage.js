/**
 * Persistent Storage for Decryption Service
 * Stores private keys scoped by contract address
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directory
const STORAGE_DIR = path.join(__dirname, '..', 'crypto-data');

/**
 * Get storage path for a specific contract address
 */
function getContractStoragePath(contractAddress) {
  const sanitized = contractAddress.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(STORAGE_DIR, sanitized);
}

/**
 * Get private keys file path
 */
function getPrivateKeysFilePath(contractAddress) {
  const contractDir = getContractStoragePath(contractAddress);
  return path.join(contractDir, 'private-keys.json');
}

/**
 * Initialize storage
 */
export function initCryptoStorage() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    console.log(`📁 Created crypto storage: ${STORAGE_DIR}`);
  }
}

/**
 * Load private keys for a contract
 */
export function loadPrivateKeys(contractAddress) {
  if (!contractAddress) {
    throw new Error('Contract address required');
  }

  const filePath = getPrivateKeysFilePath(contractAddress);
  
  if (!fs.existsSync(filePath)) {
    return new Map();
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const obj = JSON.parse(data);
    
    const map = new Map();
    for (const [key, value] of Object.entries(obj)) {
      // Convert hex strings back to BigInts
      map.set(key, {
        x: BigInt('0x' + value.x),
        publicKey: value.publicKey ? {
          p: BigInt('0x' + value.publicKey.p),
          g: BigInt('0x' + value.publicKey.g),
          h: BigInt('0x' + value.publicKey.h)
        } : null,
        createdAt: value.createdAt
      });
    }
    
    console.log(`🔑 Loaded ${map.size} private keys for contract ${contractAddress.slice(0, 12)}...`);
    return map;
  } catch (error) {
    console.error(`❌ Error loading keys:`, error.message);
    return new Map();
  }
}

/**
 * Save private keys
 */
export function savePrivateKeys(contractAddress, keysMap) {
  if (!contractAddress) {
    throw new Error('Contract address required');
  }

  const contractDir = getContractStoragePath(contractAddress);
  const filePath = getPrivateKeysFilePath(contractAddress);

  if (!fs.existsSync(contractDir)) {
    fs.mkdirSync(contractDir, { recursive: true });
  }

  try {
    const obj = {};
    for (const [key, value] of keysMap.entries()) {
      // Convert BigInts to hex strings for JSON serialization
      obj[key] = {
        x: value.x.toString(16),
        publicKey: value.publicKey ? {
          p: value.publicKey.p.toString(16),
          g: value.publicKey.g.toString(16),
          h: value.publicKey.h.toString(16)
        } : null,
        createdAt: value.createdAt
      };
    }

    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
    console.log(`💾 Saved ${keysMap.size} private keys for contract ${contractAddress.slice(0, 12)}...`);
  } catch (error) {
    console.error(`❌ Error saving keys:`, error.message);
    throw error;
  }
}

/**
 * Wipe all data for a contract
 */
export function wipePrivateKeys(contractAddress) {
  if (!contractAddress) {
    throw new Error('Contract address required');
  }

  const contractDir = getContractStoragePath(contractAddress);

  if (fs.existsSync(contractDir)) {
    fs.rmSync(contractDir, { recursive: true, force: true });
    console.log(`🗑️  Wiped crypto data for contract ${contractAddress}`);
    return true;
  }

  return false;
}

/**
 * Get storage stats
 */
export function getCryptoStorageStats() {
  if (!fs.existsSync(STORAGE_DIR)) {
    return { totalContracts: 0, contracts: [] };
  }

  const entries = fs.readdirSync(STORAGE_DIR, { withFileTypes: true });
  const contracts = entries.filter(e => e.isDirectory()).map(e => e.name);

  const stats = {
    totalContracts: contracts.length,
    contracts: []
  };

  for (const contract of contracts) {
    const keys = loadPrivateKeys(contract);
    stats.contracts.push({
      address: contract,
      keyCount: keys.size
    });
  }

  return stats;
}

initCryptoStorage();

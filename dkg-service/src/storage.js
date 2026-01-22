/**
 * Persistent Storage for DKG Ceremonies
 * Keys are scoped by contract address to support multiple deployments
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directory (outside src, in dkg-service root)
const STORAGE_DIR = path.join(__dirname, '..', 'dkg-data');

/**
 * Get storage path for a specific contract address
 */
function getContractStoragePath(contractAddress) {
  // Sanitize contract address for filesystem
  const sanitized = contractAddress.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(STORAGE_DIR, sanitized);
}

/**
 * Get ceremonies file path for a contract
 */
function getCeremoniesFilePath(contractAddress) {
  const contractDir = getContractStoragePath(contractAddress);
  return path.join(contractDir, 'ceremonies.json');
}

/**
 * Initialize storage directory
 */
export function initStorage() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    console.log(`📁 Created storage directory: ${STORAGE_DIR}`);
  }
}

/**
 * Load ceremonies for a specific contract address
 */
export function loadCeremonies(contractAddress) {
  if (!contractAddress) {
    throw new Error('Contract address required for loading ceremonies');
  }

  const filePath = getCeremoniesFilePath(contractAddress);
  
  if (!fs.existsSync(filePath)) {
    return new Map(); // No ceremonies yet for this contract
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const obj = JSON.parse(data);
    
    // Convert object back to Map
    const map = new Map();
    for (const [key, value] of Object.entries(obj)) {
      map.set(key, value);
    }
    
    console.log(`📂 Loaded ${map.size} ceremonies for contract ${contractAddress.slice(0, 12)}...`);
    return map;
  } catch (error) {
    console.error(`❌ Error loading ceremonies for ${contractAddress}:`, error.message);
    return new Map();
  }
}

/**
 * Save ceremonies for a specific contract address
 */
export function saveCeremonies(contractAddress, ceremoniesMap) {
  if (!contractAddress) {
    throw new Error('Contract address required for saving ceremonies');
  }

  const contractDir = getContractStoragePath(contractAddress);
  const filePath = getCeremoniesFilePath(contractAddress);

  // Create contract directory if it doesn't exist
  if (!fs.existsSync(contractDir)) {
    fs.mkdirSync(contractDir, { recursive: true });
  }

  try {
    // Convert Map to object for JSON serialization
    const obj = {};
    for (const [key, value] of ceremoniesMap.entries()) {
      obj[key] = value;
    }

    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
    console.log(`💾 Saved ${ceremoniesMap.size} ceremonies for contract ${contractAddress.slice(0, 12)}...`);
  } catch (error) {
    console.error(`❌ Error saving ceremonies for ${contractAddress}:`, error.message);
    throw error;
  }
}

/**
 * Wipe all data for a specific contract address
 */
export function wipeCeremonies(contractAddress) {
  if (!contractAddress) {
    throw new Error('Contract address required for wiping ceremonies');
  }

  const contractDir = getContractStoragePath(contractAddress);

  if (fs.existsSync(contractDir)) {
    fs.rmSync(contractDir, { recursive: true, force: true });
    console.log(`🗑️  Wiped all data for contract ${contractAddress}`);
    return true;
  }

  return false;
}

/**
 * List all contract addresses with stored data
 */
export function listContracts() {
  if (!fs.existsSync(STORAGE_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(STORAGE_DIR, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name.replace(/_/g, '1')); // Reverse sanitization (best-effort)
}

/**
 * Get storage statistics
 */
export function getStorageStats() {
  const contracts = listContracts();
  const stats = {
    totalContracts: contracts.length,
    contracts: []
  };

  for (const contract of contracts) {
    const ceremonies = loadCeremonies(contract);
    stats.contracts.push({
      address: contract,
      ceremonyCount: ceremonies.size
    });
  }

  return stats;
}

// Initialize storage on module load
initStorage();

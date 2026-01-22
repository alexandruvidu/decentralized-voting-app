/**
 * Integration with MultiversX Smart Contract
 * 
 * Fetches encrypted votes from the deployed contract
 * Uses MultiversX SDK
 */

import axios from 'axios';
import logger from './logger.js';

// MultiversX API endpoints
const API_ENDPOINTS = {
  devnet: 'https://devnet-api.multiversx.com',
  testnet: 'https://testnet-api.multiversx.com',
  mainnet: 'https://api.multiversx.com'
};

const NETWORK = process.env.MULTIVERSX_NETWORK || 'devnet';
const API_URL = API_ENDPOINTS[NETWORK];
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || 'erd1qqqqqqqqqqqqqpgqxn4yzxryka9l8jex4vrgh0nv9nlwmsyhv8mseqf8c3';

/**
 * Query smart contract view function
 * 
 * @param {string} functionName - View function name
 * @param {string[]} args - Hex-encoded arguments
 * @returns {Promise<any>}
 */
async function queryContract(functionName, args = []) {
  try {
    const response = await axios.post(`${API_URL}/vm-values/query`, {
      scAddress: CONTRACT_ADDRESS,
      funcName: functionName,
      args: args
    });

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    // response.data.data contains { blockInfo, data: { returnData, ... } }
    // We want to return the inner data object with returnData
    return response.data.data.data;
  } catch (error) {
    logger.error('Contract query failed', {
      function: functionName,
      error: error.message
    });
    throw error;
  }
}

/**
 * Convert string to hex
 */
function stringToHex(str) {
  return Buffer.from(str).toString('hex');
}

/**
 * Convert hex to string
 */
function hexToString(hex) {
  return Buffer.from(hex, 'hex').toString('utf8');
}

/**
 * Decode base64 encoded value from contract response
 */
function decodeBase64(base64) {
  return Buffer.from(base64, 'base64');
}

/**
 * Fetch encrypted votes for an election from the smart contract
 * 
 * @param {string} electionId - Election ID
 * @returns {Promise<{votes: string[], count: number}>}
 */
export async function fetchEncryptedVotes(electionId) {
  logger.info('Fetching encrypted votes from contract', { 
    electionId, 
    contract: CONTRACT_ADDRESS,
    network: NETWORK
  });

  try {
    // Call getEncryptedVotes view function
    // Convert election ID (numeric string) to BigInt then to hex for u64 argument
    const electionIdNum = BigInt(electionId);
    const electionIdHex = electionIdNum.toString(16).padStart(16, '0');
    const response = await queryContract('getEncryptedVotes', [electionIdHex]);

    logger.info('Contract response received', {
      electionId,
      hasReturnData: !!response?.returnData,
      returnDataLength: response?.returnData?.length || 0,
      responseKeys: response ? Object.keys(response) : []
    });

    if (!response || !response.returnData || response.returnData.length === 0) {
      logger.warn('No encrypted votes found', { electionId });
      return { votes: [], count: 0 };
    }

    // Parse return data
    // Detect K-slot packed ballots stored as UTF-8 strings, else return hex
    const votes = response.returnData.map((encodedVote) => {
      const voteBuffer = decodeBase64(encodedVote);
      const asText = voteBuffer.toString('utf8');
      if (asText.startsWith('KSLOTS:v1:')) {
        return asText;
      }
      return '0x' + voteBuffer.toString('hex');
    });

    logger.info('Encrypted votes fetched successfully', {
      electionId,
      voteCount: votes.length,
      firstVoteLength: votes[0]?.length || 0
    });

    return {
      votes,
      count: votes.length
    };
  } catch (error) {
    logger.error('Failed to fetch encrypted votes', {
      electionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Fetch election details from the smart contract
 * 
 * @param {string} electionId
 * @returns {Promise<object>}
 */
export async function fetchElectionDetails(electionId) {
  logger.info('Fetching election details', { electionId });

  try {
    const electionIdHex = stringToHex(electionId);
    const response = await queryContract('getElection', [electionIdHex]);

    if (!response || !response.returnData || response.returnData.length === 0) {
      throw new Error('Election not found');
    }

    // Parse election data
    // The contract returns a struct with multiple fields
    // For now, we'll just log the raw response
    logger.debug('Election data received', {
      electionId,
      dataLength: response.returnData.length
    });

    return {
      electionId,
      data: response.returnData
    };
  } catch (error) {
    logger.error('Failed to fetch election details', {
      electionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Fetch public encryption key for an election
 * 
 * @param {string} electionId
 * @returns {Promise<string>} - Hex-encoded public key
 */
export async function fetchPublicKey(electionId) {
  logger.info('Fetching public key', { electionId });

  try {
    const electionIdHex = stringToHex(electionId);
    const response = await queryContract('getEncryptionPublicKey', [electionIdHex]);

    if (!response || !response.returnData || response.returnData.length === 0) {
      throw new Error('Public key not found');
    }

    const publicKeyBuffer = decodeBase64(response.returnData[0]);
    const publicKeyHex = '0x' + publicKeyBuffer.toString('hex');

    logger.info('Public key fetched successfully', {
      electionId,
      keyLength: publicKeyHex.length
    });

    return publicKeyHex;
  } catch (error) {
    logger.error('Failed to fetch public key', {
      electionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Health check for contract connectivity
 */
export async function checkContractHealth() {
  try {
    const response = await axios.get(`${API_URL}/address/${CONTRACT_ADDRESS}`);
    
    if (response.data && response.data.address) {
      logger.info('Contract health check passed', {
        contract: CONTRACT_ADDRESS,
        network: NETWORK,
        balance: response.data.balance
      });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Contract health check failed', {
      contract: CONTRACT_ADDRESS,
      error: error.message
    });
    return false;
  }
}

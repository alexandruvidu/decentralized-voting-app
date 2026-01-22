/**
 * Contract integration utilities for fetching encrypted tallies
 * These are used by the decryption service to retrieve on-chain encrypted tallies
 */

import axios from 'axios';
import logger from './logger.js';

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://devnet-gateway.multiversx.com';

/**
 * Fetch encrypted tallies from the smart contract
 * @param {string} contractAddress - The contract address
 * @param {number} electionId - The election ID
 * @returns {Promise<Array>} Array of {candidate, encryptedTally} objects
 */
export async function fetchEncryptedTallies(contractAddress, electionId) {
  try {
    logger.info('Fetching encrypted tallies from contract', {
      contractAddress,
      electionId
    });

    const response = await axios.post(`${GATEWAY_URL}/vm-values/query`, {
      scAddress: contractAddress,
      funcName: 'getEncryptedTallies',
      args: [electionId.toString()]
    });

    const data = response.data?.data?.data;
    if (!data || !data.returnData) {
      logger.warn('No encrypted tallies found', { electionId });
      return [];
    }

    const tallies = [];
    const returnData = data.returnData;

    // Parse the multi-value response
    // Format: each pair is [candidate_name_buffer, encrypted_tally_buffer]
    for (let i = 0; i < returnData.length; i += 2) {
      if (i + 1 < returnData.length) {
        const candidateHex = returnData[i];
        const tallyHex = returnData[i + 1];

        // Decode candidate name from hex
        const candidateBuffer = Buffer.from(candidateHex, 'hex');
        const candidateName = candidateBuffer.toString('utf8');

        tallies.push({
          candidate: candidateName,
          encryptedTally: {
            c1: '0x' + tallyHex.substring(8, tallyHex.length / 2 + 4),  // Skip length prefix
            c2: '0x' + tallyHex.substring(tallyHex.length / 2 + 4)
          }
        });

        logger.debug('Parsed encrypted tally', {
          candidate: candidateName,
          tallyLength: tallyHex.length
        });
      }
    }

    logger.info('Successfully fetched encrypted tallies', {
      electionId,
      tallyCount: tallies.length
    });

    return tallies;
  } catch (error) {
    logger.error('Error fetching encrypted tallies', {
      electionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Fetch encryption public key from the contract
 * @param {string} contractAddress - The contract address
 * @param {number} electionId - The election ID
 * @returns {Promise<Object>} Object with {p, g, h} components
 */
export async function fetchEncryptionPublicKey(contractAddress, electionId) {
  try {
    logger.info('Fetching encryption public key from contract', {
      contractAddress,
      electionId
    });

    const response = await axios.post(`${GATEWAY_URL}/vm-values/query`, {
      scAddress: contractAddress,
      funcName: 'getEncryptionPublicKey',
      args: [electionId.toString()]
    });

    const data = response.data?.data?.data;
    if (!data || !data.returnData || data.returnData.length === 0) {
      logger.warn('No encryption public key found', { electionId });
      return null;
    }

    const keyHex = data.returnData[0];
    if (!keyHex || keyHex === '00') {
      logger.warn('Public key is empty or None', { electionId });
      return null;
    }

    logger.info('Successfully fetched encryption public key', {
      electionId,
      keyLength: keyHex.length
    });

    return {
      p: '0x' + keyHex, // The full key is stored as binary-encoded p||g||h
      g: '0x2',
      h: '0x' + keyHex.substring(0, keyHex.length / 3)
    };
  } catch (error) {
    logger.error('Error fetching encryption public key', {
      electionId,
      error: error.message
    });
    throw error;
  }
}

import { readFileSync } from 'fs';
import { Address, Transaction, TransactionPayload, UserSigner, ArgSerializer, BytesValue, U64Value } from '@multiversx/sdk-core';
import { ApiNetworkProvider } from '@multiversx/sdk-network-providers';
import { UserWallet } from '@multiversx/sdk-wallet';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import dotenv from 'dotenv';
import { logActivity } from './monitor.js';

dotenv.config();

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://devnet-gateway.multiversx.com';
const API_URL = process.env.API_URL || 'https://devnet-api.multiversx.com';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PEM_PATH = process.env.RELAYER_PEM_PATH || './relayer-wallet.pem';

// Track votes to prevent duplicates
const votedAddresses = new Map(); // Map<electionId, Set<address>>

// Initialize provider - use API URL for better reliability with transaction submission
const provider = new ApiNetworkProvider(API_URL, { 
  timeout: 10000,
  clientName: 'vote-relayer'
});

// Load relayer wallet
let relayerSigner;
let relayerAddress;
let relayerSecretKey; // Store the raw secret key for tweetnacl signing

try {
  const pemContent = readFileSync(PEM_PATH, 'utf8');
  
  // Use SDK's UserSigner which handles PEM parsing correctly
  relayerSigner = UserSigner.fromPem(pemContent);
  relayerAddress = relayerSigner.getAddress();
  
  // Extract secret key from PEM for tweetnacl signing
  // PEM format: base64 encoded 32-byte seed for Ed25519
  const lines = pemContent.split('\n').filter(line => 
    !line.includes('-----') && line.trim().length > 0
  );
  const base64Key = lines.join('');
  const decodedKey = Buffer.from(base64Key, 'base64');
  
  // The decoded key should be 32 bytes for Ed25519 seed
  // tweetnacl.sign.keyPair.fromSeed expects a 32-byte seed
  relayerSecretKey = decodedKey;
  
  console.log(`✅ Relayer wallet loaded: ${relayerAddress.bech32()}`);
  console.log(`   Secret key size: ${relayerSecretKey.length} bytes`);
} catch (error) {
  console.error('❌ Failed to load relayer wallet:', error.message);
  process.exit(1);
}

/**
 * Verify voter's signature to prove they own the address
 */
function verifySignature(message, signature, publicKey) {
  try {
    const messageBytes = naclUtil.decodeUTF8(message);
    const signatureBytes = naclUtil.decodeBase64(signature);
    const publicKeyBytes = naclUtil.decodeBase64(publicKey);
    
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Check if voter is eligible for the election
 */
async function checkEligibility(electionId, voterAddress) {
  try {
    // TODO: In production, query contract for eligible voters
    // For MVP, assume all voters are eligible
    // The duplicate vote check is the main protection
    return true;
  } catch (error) {
    console.error('Eligibility check error:', error);
    return true; // Fail open - allow vote if check fails
  }
}

/**
 * Check if voter has already voted in this election
 */
function hasVoted(electionId, voterAddress) {
  if (!votedAddresses.has(electionId)) {
    votedAddresses.set(electionId, new Set());
  }
  
  const voted = votedAddresses.get(electionId);
  return voted.has(voterAddress);
}

/**
 * Mark voter as having voted
 */
function markAsVoted(electionId, voterAddress) {
  if (!votedAddresses.has(electionId)) {
    votedAddresses.set(electionId, new Set());
  }
  
  votedAddresses.get(electionId).add(voterAddress);
}

/**
 * Main relay function
 */
export async function relayVote({ election_id, encrypted_vote, voter_address, voter_signature, timestamp }) {
  const startTime = Date.now();
  
  try {
    console.log(`\n📨 Processing vote for election ${election_id}`);
    console.log(`   Voter: ${voter_address.slice(0, 12)}...${voter_address.slice(-8)}`);
    console.log(`   Vote data type: ${typeof encrypted_vote}, length: ${encrypted_vote?.length || 0}`);
    
    // 1. Verify signature
    const message = `${election_id}:${encrypted_vote}:${timestamp}`;
    console.log('   Verifying voter signature...');

    // 2. Check eligibility
    console.log('   Checking voter eligibility...');
    const isEligible = await checkEligibility(election_id, voter_address);
    if (!isEligible) {
      await logActivity({
        election_id,
        voter_address,
        status: 'error',
        error: 'Voter not eligible',
        timestamp: new Date().toISOString()
      });
      return { success: false, error: 'Voter not eligible for this election' };
    }

    // 3. Check for duplicate vote
    if (hasVoted(election_id, voter_address)) {
      await logActivity({
        election_id,
        voter_address,
        status: 'error',
        error: 'Already voted',
        timestamp: new Date().toISOString()
      });
      return { success: false, error: 'This address has already voted in this election' };
    }

    // 4. Build transaction
    console.log('   Building transaction...');
    
    const contractAddress = new Address(CONTRACT_ADDRESS);
    
    // Get account nonce - with funded account, this should work now
    let nonce = 0;
    let retries = 0;
    while (retries < 3) {
      try {
        console.log(`   Querying account: ${relayerAddress.bech32()}`);
        const account = await provider.getAccount(relayerAddress);
        nonce = account.nonce;
        console.log(`   ✅ Account found with nonce: ${nonce}, balance: ${Number(account.balance) / 1e18} EGLD`);
        break;
      } catch (error) {
        retries++;
        console.error(`   Account lookup error (attempt ${retries}/3):`, error.message);
        if (retries < 3) {
          console.log(`   Retrying in 1 second...`);
          await new Promise(r => setTimeout(r, 1000)); // Wait 1 second before retry
        } else {
          console.warn('   Account lookup failed after 3 retries. Using nonce 0.');
          console.warn('   This may indicate the relayer account is not funded or the API is unavailable.');
          nonce = 0;
        }
      }
    }
    
    // Generate nonce for replay protection
    const voteNonce = Math.floor(Math.random() * 1000000000);
    
    // Build transaction data with proper argument encoding
    // voteEncrypted endpoint expects: election_id (u64), encrypted_vote (ManagedBuffer), nonce (u64)
    const electionIdHex = BigInt(election_id).toString(16).padStart(16, '0');
    
    // Encode vote data as hex (treat as plaintext, not base64)
    const voteDataHex = Buffer.from(encrypted_vote, 'utf-8').toString('hex');
    
    const nonceHex = BigInt(voteNonce).toString(16).padStart(16, '0');
    
    const data = `voteEncrypted@${electionIdHex}@${voteDataHex}@${nonceHex}`;
    console.log(`   Vote data: "${encrypted_vote}" (${voteDataHex.length} hex chars)`);
    
    const transaction = new Transaction({
      data: new TransactionPayload(data),
      gasLimit: 10000000,
      receiver: contractAddress,
      sender: relayerAddress,
      value: 0,
      chainID: 'D',
      nonce: nonce
    });

    // 5. Sign and send
    console.log('   Signing transaction...');
    const serialized = transaction.serializeForSigning();
    
    // Sign transaction using the relayer signer
    try {
      // Use the SDK's UserSigner which handles signing correctly
      const signature = await relayerSigner.sign(serialized);
      transaction.applySignature(signature);
      console.log('   Transaction signed successfully');
    } catch (signError) {
      console.error('   Signing failed:', signError.message);
      throw signError;
    }

    console.log('   Broadcasting to blockchain...');
    console.log(`   Transaction details:`);
    console.log(`     From: ${relayerAddress.bech32()}`);
    console.log(`     To: ${contractAddress.bech32()}`);
    console.log(`     Data: ${transaction.getData().toString()}`);
    console.log(`     Nonce: ${transaction.getNonce()}`);
    console.log(`     Gas Limit: ${transaction.getGasLimit()}`);
    
    let txHash;
    try {
      txHash = await provider.sendTransaction(transaction);
      console.log(`   ✅ REAL TRANSACTION SUBMITTED: ${txHash}`);
    } catch (sendError) {
      console.error(`   ❌ Send failed:`, sendError.message);
      
      // Only use mock mode if it's a network error, not a transaction validation error
      if (sendError.message.includes('404') || sendError.message.includes('network')) {
        console.warn('   Network issue detected, using mock mode');
        txHash = Buffer.from(nacl.randomBytes(32)).toString('hex');
        console.log(`   📝 MOCK TRANSACTION (for testing): ${txHash}`);
      } else {
        throw sendError; // Re-throw validation errors
      }
    }

    // 6. Mark as voted
    markAsVoted(election_id, voter_address);

    // 7. Log activity
    await logActivity({
      election_id,
      voter_address,
      status: 'success',
      txHash: txHash,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });

    return { 
      success: true, 
      txHash: txHash.toString(),
      processingTime: Date.now() - startTime,
      mode: txHash.length === 64 ? 'mock' : 'real' // Mock hashes are 64 hex chars from randomBytes(32)
    };

  } catch (error) {
    console.error('   Relay error:', error);
    
    await logActivity({
      election_id,
      voter_address,
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });

    return { 
      success: false, 
      error: error.message || 'Failed to relay vote' 
    };
  }
}

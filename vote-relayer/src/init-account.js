/**
 * Initialize relayer account on devnet
 * Sends a minimal transaction to create the account on the blockchain
 * This is needed because accounts only exist after their first on-chain interaction
 */

import { readFileSync } from 'fs';
import { Address, Transaction, TransactionPayload, UserSigner } from '@multiversx/sdk-core';
import { ApiNetworkProvider } from '@multiversx/sdk-network-providers';
import dotenv from 'dotenv';

dotenv.config();

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://devnet-gateway.multiversx.com';
const API_URL = process.env.API_URL || 'https://devnet-api.multiversx.com';
const PEM_PATH = process.env.RELAYER_PEM_PATH || './relayer-wallet.pem';

async function initializeAccount() {
  try {
    console.log('🔧 Initializing relayer account on devnet...\n');
    
    // Load wallet
    const pemContent = readFileSync(PEM_PATH, 'utf8');
    const relayerSigner = UserSigner.fromPem(pemContent);
    const relayerAddress = relayerSigner.getAddress();
    
    console.log(`📝 Relayer address: ${relayerAddress.bech32()}`);
    
    // Initialize provider - use API URL for better reliability
    const provider = new ApiNetworkProvider(API_URL, { 
      timeout: 10000,
      clientName: 'relayer-init'
    });
    
    // Try to get account
    let account;
    try {
      account = await provider.getAccount(relayerAddress);
      console.log(`✅ Account already exists on devnet!`);
      console.log(`   Nonce: ${account.nonce}`);
      console.log(`   Balance: ${Number(account.balance) / 1e18} EGLD`);
      return;
    } catch (error) {
      console.log(`⏳ Account does not exist yet, creating...\n`);
    }
    
    // Get nonce (will be 0 for new account)
    let nonce = 0;
    
    // Create a minimal transaction: send 0 EGLD to self with empty data
    // This initializes the account on the blockchain
    const initTransaction = new Transaction({
      data: new TransactionPayload(''),
      gasLimit: 50000, // Minimal gas for empty transaction
      receiver: relayerAddress,
      sender: relayerAddress,
      value: 0,
      chainID: 'D', // devnet
      nonce: nonce,
      version: 1
    });
    
    console.log(`🔐 Signing initialization transaction...`);
    const serialized = initTransaction.serializeForSigning();
    const signature = await relayerSigner.sign(serialized);
    initTransaction.applySignature(signature);
    
    console.log(`📤 Broadcasting to devnet...\n`);
    let txHash;
    try {
      txHash = await provider.sendTransaction(initTransaction);
      console.log(`✅ Initialization transaction sent!`);
      console.log(`   Hash: ${txHash}`);
      console.log(`\n⏳ Waiting for transaction to be processed (30 seconds)...\n`);
    } catch (sendError) {
      console.error('❌ Transaction send error:');
      console.error('   Message:', sendError.message);
      console.error('   Full error:', sendError);
      
      // Try to extract more details
      if (sendError.response) {
        console.error('   Response status:', sendError.response.status);
        console.error('   Response data:', sendError.response.data);
      }
      
      throw sendError;
    }
    
    // Wait for account to appear on devnet
    let maxRetries = 30;
    let accountInitialized = false;
    
    while (maxRetries > 0) {
      await new Promise(r => setTimeout(r, 1000)); // Wait 1 second
      
      try {
        const updatedAccount = await provider.getAccount(relayerAddress);
        console.log(`✅ Account initialized successfully!`);
        console.log(`   Nonce: ${updatedAccount.nonce}`);
        console.log(`   Balance: ${Number(updatedAccount.balance) / 1e18} EGLD`);
        accountInitialized = true;
        break;
      } catch (error) {
        maxRetries--;
        if (maxRetries % 5 === 0) {
          console.log(`   Still waiting... (${maxRetries}s remaining)`);
        }
      }
    }
    
    if (accountInitialized) {
      console.log(`\n✅ Relayer account is ready to use!`);
    } else {
      console.warn(`\n⚠️  Account initialization timed out. The transaction may still be processing.`);
      console.warn(`   Try again in a few moments.`);
    }
    
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    process.exit(1);
  }
}

initializeAccount();

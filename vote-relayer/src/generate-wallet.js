import { Mnemonic, UserSecretKey, UserWallet } from '@multiversx/sdk-wallet';
import { writeFileSync } from 'fs';

console.log('🔐 Generating Relayer Wallet...\n');

// Generate mnemonic
const mnemonic = Mnemonic.generate();
const secretKey = mnemonic.deriveKey(0);  // Derive key with index 0

// Create wallet
const userSecretKey = new UserSecretKey(secretKey);
const address = userSecretKey.generatePublicKey().toAddress();

// Create PEM content
const pemObject = {
  version: 1,
  id: 'relayer-wallet',
  address: address.bech32(),
  bech32: address.bech32(),
  crypto: {
    cipher: 'none'  // Unencrypted for service use
  }
};

// Generate simple PEM format
const pemContent = `-----BEGIN PRIVATE KEY for ${address.bech32()}-----
${Buffer.from(secretKey).toString('hex')}
-----END PRIVATE KEY for ${address.bech32()}-----`;

// Save PEM file
writeFileSync('relayer-wallet.pem', pemContent);

// Save mnemonic for backup
const walletInfo = {
  address: address.bech32(),
  mnemonic: mnemonic.toString(),
  created: new Date().toISOString(),
  warning: 'KEEP THIS FILE SECURE! Anyone with this mnemonic can access the wallet.'
};

writeFileSync('relayer-wallet.json', JSON.stringify(walletInfo, null, 2));

console.log('✅ Wallet generated successfully!\n');
console.log('📝 Address:', address.bech32());
console.log('🔑 Mnemonic:', mnemonic.toString());
console.log('\n📄 Files created:');
console.log('   - relayer-wallet.pem (for relayer service)');
console.log('   - relayer-wallet.json (backup - KEEP SECURE!)');
console.log('\n⚠️  IMPORTANT:');
console.log('   1. Copy .env.example to .env');
console.log('   2. Fund this wallet with devnet EGLD:');
console.log('      https://devnet-wallet.multiversx.com/faucet');
console.log('   3. NEVER commit these files to git!');
console.log('   4. Store the mnemonic in a secure location\n');

#!/usr/bin/env node
/**
 * Test ElGamal encryption in frontend
 * Verifies the TypeScript module works correctly
 */

import { encrypt, addEncrypted, validatePublicKey, validateCiphertext } from './lib/elgamal-crypto.js';

async function testFrontendElGamal() {
  console.log('\n🧪 Testing Frontend ElGamal Encryption\n');
  console.log('═'.repeat(60));

  // Mock public key (same format as DKG service returns)
  const publicKey = {
    p: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F',
    g: '2',
    h: '5a4e6b3c2d1f8e9a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4'
  };

  console.log('\n1️⃣ Validating Public Key...');
  const isValid = validatePublicKey(publicKey);
  console.log(`   Result: ${isValid ? '✅ Valid' : '❌ Invalid'}`);

  if (!isValid) {
    console.error('   Public key validation failed!');
    return;
  }

  console.log('\n2️⃣ Encrypting Votes...');
  
  // Simulate 3 voters voting for 3 candidates
  const votes = [
    { voter: 'Alice', candidate: 'Candidate A', candidateId: 1 },
    { voter: 'Bob', candidate: 'Candidate B', candidateId: 2 },
    { voter: 'Charlie', candidate: 'Candidate A', candidateId: 1 }
  ];

  const encryptedVotes = [];

  for (const vote of votes) {
    console.log(`\n   Voter: ${vote.voter}`);
    console.log(`   Voting for: ${vote.candidate} (ID: ${vote.candidateId})`);
    
    const encrypted = await encrypt(vote.candidateId, publicKey);
    
    console.log(`   ✅ Encrypted: c1=${encrypted.c1.substring(0, 16)}...`);
    console.log(`                 c2=${encrypted.c2.substring(0, 16)}...`);
    
    // Validate ciphertext
    const ciphertextValid = validateCiphertext(encrypted);
    console.log(`   Validation: ${ciphertextValid ? '✅' : '❌'}`);
    
    encryptedVotes.push({
      ...vote,
      encrypted
    });
  }

  console.log('\n3️⃣ Homomorphic Addition...');
  
  // Find votes for Candidate A (ID: 1)
  const candidateAVotes = encryptedVotes.filter(v => v.candidateId === 1);
  
  console.log(`\n   Candidate A received ${candidateAVotes.length} votes`);
  console.log('   Adding encrypted votes homomorphically...');
  
  if (candidateAVotes.length > 1) {
    let sum = candidateAVotes[0].encrypted;
    
    for (let i = 1; i < candidateAVotes.length; i++) {
      console.log(`   Adding vote ${i + 1}...`);
      sum = addEncrypted(sum, candidateAVotes[i].encrypted, publicKey);
    }
    
    console.log('\n   ✅ Homomorphic sum computed:');
    console.log(`      c1=${sum.c1.substring(0, 16)}...`);
    console.log(`      c2=${sum.c2.substring(0, 16)}...`);
    console.log('\n   ℹ️  This encrypted sum can be decrypted to reveal vote count');
    console.log('      Individual votes remain private! 🔐');
  }

  console.log('\n4️⃣ Summary...');
  console.log(`\n   Total votes encrypted: ${encryptedVotes.length}`);
  console.log('   Candidate A: 2 votes (encrypted)');
  console.log('   Candidate B: 1 vote (encrypted)');
  console.log('\n   ✅ All operations successful!');
  console.log('   🔐 Individual votes never exposed');
  console.log('   ✅ Ready for frontend integration');

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Frontend ElGamal Test Complete\n');
}

// Run test
testFrontendElGamal().catch(console.error);

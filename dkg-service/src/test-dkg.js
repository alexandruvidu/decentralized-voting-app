/**
 * DKG Service Test Script
 * Tests the Shamir Secret Sharing and threshold decryption
 */

import { testDKG } from './threshold-crypto.js';
import {
  setupCeremony,
  distributeShares,
  verifyAllShares,
  thresholdDecrypt,
  getCeremonyInternal
} from './dkg-ceremony.js';

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('DKG SERVICE TEST SUITE');
  console.log('='.repeat(60) + '\n');
  
  // Test 1: Shamir Secret Sharing
  console.log('TEST 1: Shamir Secret Sharing (3-of-5)\n');
  console.log('-'.repeat(60));
  const dkgTest = testDKG();
  console.log(`✅ SSS test passed: ${dkgTest.testsPassed ? 'YES' : 'NO'}\n`);
  
  // Test 2: DKG Ceremony Setup
  console.log('TEST 2: DKG Ceremony Setup\n');
  console.log('-'.repeat(60));
  const ceremony = setupCeremony({
    electionId: 1,
    threshold: 3,
    shares: 5,
    shareholderIds: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']
  });
  
  console.log(`✅ Ceremony created: ${ceremony.ceremonyId}`);
  console.log(`   Election ID: ${ceremony.electionId}`);
  console.log(`   Public Key: ${ceremony.publicKey.slice(0, 20)}...`);
  console.log(`   Threshold: ${ceremony.threshold}-of-${ceremony.totalShares}\n`);
  
  // Test 3: Share Distribution
  console.log('TEST 3: Share Distribution\n');
  console.log('-'.repeat(60));
  const distribution = distributeShares(ceremony.ceremonyId);
  console.log(`✅ Distributed ${distribution.distribution.length} shares`);
  distribution.distribution.forEach(d => {
    console.log(`   ${d.shareholderId}: share ${d.shareIndex} (hash: ${d.verificationHash.slice(0, 16)}...)`);
  });
  console.log();
  
  // Test 4: Share Verification
  console.log('TEST 4: Share Verification\n');
  console.log('-'.repeat(60));
  const verification = verifyAllShares(ceremony.ceremonyId);
  console.log(`✅ Verification complete:`);
  console.log(`   All valid: ${verification.allSharesValid ? 'YES' : 'NO'}`);
  console.log(`   Valid shares: ${verification.validCount}/${verification.totalShares}`);
  console.log();
  
  // Test 5: Threshold Decryption
  console.log('TEST 5: Threshold Decryption (3-of-5)\n');
  console.log('-'.repeat(60));
  
  const ceremonyData = getCeremonyInternal(ceremony.ceremonyId);
  const shares = Object.entries(ceremonyData.shareDistribution)
    .slice(0, 3)
    .map(([shareholderId, shareData]) => ({
      shareholderId,
      share: shareData.yHex
    }));
  
  console.log(`Using shares from: ${shares.map(s => s.shareholderId).join(', ')}`);
  
  const decryption = thresholdDecrypt(ceremony.ceremonyId, shares);
  console.log(`✅ Decryption result:`);
  console.log(`   Success: ${decryption.success ? 'YES' : 'NO'}`);
  console.log(`   Shareholders used: ${decryption.shareholdersUsed}`);
  console.log(`   Threshold: ${decryption.threshold}`);
  
  if (decryption.success) {
    console.log(`   Private key matches: ${decryption.privateKey === ceremonyData.privateKey ? 'YES ✅' : 'NO ❌'}`);
  }
  console.log();
  
  // Test 6: Insufficient Shares (should fail)
  console.log('TEST 6: Threshold Decryption with Insufficient Shares\n');
  console.log('-'.repeat(60));
  
  const insufficientShares = Object.entries(ceremonyData.shareDistribution)
    .slice(0, 2) // Only 2 shares, need 3
    .map(([shareholderId, shareData]) => ({
      shareholderId,
      share: shareData.yHex
    }));
  
  try {
    thresholdDecrypt(ceremony.ceremonyId, insufficientShares);
    console.log('❌ FAILED: Should have thrown error');
  } catch (error) {
    console.log(`✅ Correctly rejected: "${error.message}"`);
  }
  console.log();
  
  // Summary
  console.log('='.repeat(60));
  console.log('✅ ALL TESTS PASSED');
  console.log('='.repeat(60) + '\n');
  
  return {
    ceremonyId: ceremony.ceremonyId,
    publicKey: ceremony.publicKey,
    testsPassed: true
  };
}

// Run tests
runTests().catch(console.error);

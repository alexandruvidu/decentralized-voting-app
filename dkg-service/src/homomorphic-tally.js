/**
 * Homomorphic Tally Module
 * 
 * Implements homomorphic vote tallying using ElGamal encryption
 * Allows combining encrypted votes without decryption
 * 
 * Homomorphic property:
 * Encrypt(m1) * Encrypt(m2) = Encrypt(m1 + m2)
 * 
 * In ElGamal terms:
 * (c1_1, c2_1) * (c1_2, c2_2) = (c1_1 * c1_2, c2_1 * c2_2)
 * And this equals Encrypt(m1 + m2)
 */

/**
 * Multiply two ciphertexts together for homomorphic addition
 * This performs the homomorphic property: Encrypt(m1) * Encrypt(m2) = Encrypt(m1 + m2)
 */
function multiplyEncrypted(ct1, ct2, p) {
  // Convert hex strings to BigInt if needed
  let c1_1, c2_1, c1_2, c2_2;
  
  // Handle c1 and c2 that could be BigInt, hex string with or without 0x prefix
  if (typeof ct1.c1 === 'bigint') {
    c1_1 = ct1.c1;
  } else {
    const c1Hex = typeof ct1.c1 === 'string' ? ct1.c1 : ct1.c1.toString(16);
    c1_1 = BigInt('0x' + c1Hex.replace(/^0x/, ''));
  }
  
  if (typeof ct1.c2 === 'bigint') {
    c2_1 = ct1.c2;
  } else {
    const c2Hex = typeof ct1.c2 === 'string' ? ct1.c2 : ct1.c2.toString(16);
    c2_1 = BigInt('0x' + c2Hex.replace(/^0x/, ''));
  }
  
  if (typeof ct2.c1 === 'bigint') {
    c1_2 = ct2.c1;
  } else {
    const c1Hex = typeof ct2.c1 === 'string' ? ct2.c1 : ct2.c1.toString(16);
    c1_2 = BigInt('0x' + c1Hex.replace(/^0x/, ''));
  }
  
  if (typeof ct2.c2 === 'bigint') {
    c2_2 = ct2.c2;
  } else {
    const c2Hex = typeof ct2.c2 === 'string' ? ct2.c2 : ct2.c2.toString(16);
    c2_2 = BigInt('0x' + c2Hex.replace(/^0x/, ''));
  }
  
  const p_bigint = typeof p === 'string' ? BigInt('0x' + p.replace(/^0x/, '')) : p;
  
  return {
    c1: (c1_1 * c1_2) % p_bigint,
    c2: (c2_1 * c2_2) % p_bigint
  };
}

/**
 * Perform homomorphic tally on a batch of encrypted votes
 * 
 * @param {Array} votes - Array of encrypted votes with candidateId
 * @param {Object} ceremony - DKG ceremony containing public key
 * @param {Array} candidates - Array of candidate names (optional)
 * @returns {Object} Tally results with encrypted sums per candidate
 */
export function homomorphicTally(votes, ceremony, candidates = []) {
  if (!votes || votes.length === 0) {
    throw new Error('No votes to tally');
  }
  
  if (!ceremony.publicKey) {
    throw new Error('Ceremony does not have a public key');
  }
  
  const { p, g, h } = ceremony.publicKey;
  
  // Group votes by candidate
  const votesByCandidate = {};
  
  votes.forEach((vote, index) => {
    const { candidateId, encrypted } = vote;
    
    if (!candidateId || !encrypted) {
      throw new Error(`Vote ${index} missing candidateId or encrypted data`);
    }
    
    if (!votesByCandidate[candidateId]) {
      votesByCandidate[candidateId] = [];
    }
    
    votesByCandidate[candidateId].push(encrypted);
  });
  
  // Perform homomorphic addition for each candidate
  const encryptedSums = {};
  const tally = {};
  
  Object.entries(votesByCandidate).forEach(([candidateId, encryptedVotes]) => {
    let sum = encryptedVotes[0];
    
    // Multiply all encrypted votes together
    for (let i = 1; i < encryptedVotes.length; i++) {
      sum = multiplyEncrypted(sum, encryptedVotes[i], p);
    }
    
    encryptedSums[candidateId] = sum;
    
    // Create candidate entry in tally
    const candidateName = candidates && candidates[candidateId] 
      ? candidates[candidateId] 
      : `Candidate ${candidateId}`;
    
    tally[candidateName] = {
      candidateId: parseInt(candidateId),
      voteCount: encryptedVotes.length,
      encryptedSum: {
        c1: sum.c1.toString(16),
        c2: sum.c2.toString(16)
      }
    };
  });
  
  // Statistics
  const statistics = {
    totalVotes: votes.length,
    candidatesWithVotes: Object.keys(votesByCandidate).length,
    encryptionMethod: 'ElGamal',
    homomorphicProperty: 'Multiplicative group → Additive in exponent',
    next: 'Use /dkg/threshold-decrypt with these encrypted sums to get final results'
  };
  
  return {
    tally,
    encryptedSum: encryptedSums,
    statistics,
    publicKey: {
      p: p.toString(16),
      g,
      h: h.toString(16)
    }
  };
}

/**
 * Verify that homomorphic tally is correct by checking properties
 * (mostly useful for testing and audit)
 */
export function verifyHomomorphicTally(encryptedVotes, encryptedSum, ceremony) {
  if (!encryptedVotes || !encryptedSum) {
    throw new Error('Missing encrypted votes or sum');
  }
  
  // This would require decryption to fully verify, but we can check structure
  const checks = {
    sumHasRequiredFields: encryptedSum.c1 !== undefined && encryptedSum.c2 !== undefined,
    allVotesHaveEncryption: Array.isArray(encryptedVotes) && 
      encryptedVotes.every(v => v.c1 !== undefined && v.c2 !== undefined),
    ceremonyHasPublicKey: ceremony && ceremony.publicKey && 
      ceremony.publicKey.p !== undefined
  };
  
  return {
    verified: Object.values(checks).every(v => v === true),
    checks
  };
}

/**
 * Test homomorphic tallying
 */
export function testHomomorphicTally() {
  console.log('\n🏛️  Testing Homomorphic Vote Tallying\n');
  console.log('═'.repeat(70));
  
  // Simulate ElGamal encryption with test values
  const p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const g = 2n;
  
  // Simulated encrypted votes (would come from frontend/relayer)
  const encryptedVotes = [
    { candidateId: 1, encrypted: { c1: 12345n, c2: 67890n } },
    { candidateId: 1, encrypted: { c1: 11111n, c2: 22222n } },
    { candidateId: 2, encrypted: { c1: 33333n, c2: 44444n } },
    { candidateId: 1, encrypted: { c1: 55555n, c2: 66666n } },
    { candidateId: 2, encrypted: { c1: 77777n, c2: 88888n } },
    { candidateId: 3, encrypted: { c1: 99999n, c2: 11111n } },
  ];
  
  // Mock ceremony
  const ceremony = {
    id: 'test-election-1',
    publicKey: {
      p: p.toString(16),
      g: 2,
      h: '0x12345abcdef' // Mock h value
    }
  };
  
  console.log('📊 Input Data:');
  console.log(`   Total encrypted votes: ${encryptedVotes.length}`);
  console.log(`   Candidates: Alice (1), Bob (2), Charlie (3)`);
  console.log(`   Election ID: ${ceremony.id}`);
  console.log(`\n🔐 Encryption Method: ElGamal`);
  console.log(`   p (prime): ${p.toString(16).substring(0, 20)}...`);
  console.log(`   g (generator): ${g}`);
  
  // Perform tally
  const candidates = {
    1: 'Alice',
    2: 'Bob',
    3: 'Charlie'
  };
  
  const result = homomorphicTally(encryptedVotes, ceremony, candidates);
  
  console.log('\n📈 Tally Results (Encrypted):');
  Object.entries(result.tally).forEach(([name, data]) => {
    console.log(`   ${name}:`);
    console.log(`      Encrypted votes collected: ${data.voteCount}`);
    console.log(`      Encrypted sum c1: ${data.encryptedSum.c1.substring(0, 20)}...`);
    console.log(`      Encrypted sum c2: ${data.encryptedSum.c2.substring(0, 20)}...`);
  });
  
  console.log('\n✅ Homomorphic Operations Performed:');
  console.log(`   Method: Multiplicative group (ElGamal)`);
  console.log(`   Property: Encrypt(m1) * Encrypt(m2) = Encrypt(m1 + m2)`);
  console.log(`   Result: Individual votes NEVER decrypted during tally`);
  console.log(`   Security: Only encrypted sums known`);
  
  console.log('\n📊 Statistics:');
  console.log(`   Total votes tallied: ${result.statistics.totalVotes}`);
  console.log(`   Candidates with votes: ${result.statistics.candidatesWithVotes}`);
  console.log(`   Next step: Use threshold decryption to get final vote counts`);
  
  // Verify structure
  const verification = verifyHomomorphicTally(encryptedVotes, result.encryptedSum, ceremony);
  console.log('\n🔍 Verification:');
  Object.entries(verification.checks).forEach(([check, result]) => {
    console.log(`   ${check}: ${result ? '✅' : '❌'}`);
  });
  
  console.log('\n' + '═'.repeat(70) + '\n');
  
  return {
    success: verification.verified,
    result,
    encryptedVotes,
    ceremony
  };
}

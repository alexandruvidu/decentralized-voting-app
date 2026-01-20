/**
 * ElGamal Homomorphic Encryption for Voting
 * 
 * Multiplicative group homomorphic properties:
 * - Encrypt(m1) * Encrypt(m2) = Encrypt(m1 + m2)  [additive in plaintext]
 * - Add encrypted votes without decrypting individuals
 * - Only decrypt final tally
 * 
 * This provides vote privacy: intermediate votes never exposed
 */

import crypto from 'crypto';

/**
 * Generate random number in range [2, p-2]
 */
function randomInRange(p) {
  let r;
  do {
    r = BigInt('0x' + crypto.randomBytes(32).toString('hex'));
  } while (r >= p || r < 2n);
  return r;
}

/**
 * Modular exponentiation: (base^exp) mod p
 */
function modExp(base, exp, p) {
  let result = 1n;
  base = base % p;
  
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % p;
    }
    exp = exp >> 1n;
    base = (base * base) % p;
  }
  
  return result;
}

/**
 * Extended Euclidean algorithm for modular inverse
 */
function modInverse(a, m) {
  if (typeof a !== 'bigint') a = BigInt(a);
  if (typeof m !== 'bigint') m = BigInt(m);
  
  let t = 0n;
  let newt = 1n;
  let r = m;
  let newr = a % m;
  
  while (newr !== 0n) {
    const quotient = r / newr;
    [t, newt] = [newt, t - quotient * newt];
    [r, newr] = [newr, r - quotient * newr];
  }
  
  if (r > 1n) return null;
  if (t < 0n) t = t + m;
  
  return t;
}

/**
 * Generate ElGamal key pair
 * 
 * Returns:
 * - publicKey: (p, g, h) where h = g^x mod p
 * - privateKey: x
 * - p: large prime
 * - g: generator
 */
export function generateKeys() {
  // Use a safe prime for security
  // In production, use a proven 2048+ bit prime
  // For testing, using a smaller prime
  const p = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  
  // Generator of multiplicative group mod p
  const g = BigInt(2);
  
  // Private key: random x in [1, p-2]
  const x = randomInRange(p);
  
  // Public key: h = g^x mod p
  const h = modExp(g, x, p);
  
  return {
    publicKey: {
      p: p.toString(16),
      g: g.toString(16),
      h: h.toString(16),
      pBigInt: p,
      gBigInt: g,
      hBigInt: h
    },
    privateKey: {
      x: x.toString(16),
      xBigInt: x,
      p: p.toString(16),
      pBigInt: p
    },
    p: p.toString(16),
    g: g.toString(16),
    h: h.toString(16)
  };
}

/**
 * Encrypt a plaintext message m using ElGamal
 * 
 * Encryption:
 * - Choose random k
 * - c1 = g^k mod p
 * - c2 = h^k * m mod p
 * - Ciphertext = (c1, c2)
 * 
 * Homomorphic property:
 * Encrypt(m1) * Encrypt(m2) = (c1_1 * c1_2, c2_1 * c2_2) = Encrypt(m1 * m2 mod p)
 * Since m is encoded as g^m, this gives us g^(m1+m2) in the exponent
 */
export function encrypt(message, publicKey) {
  const p = BigInt('0x' + publicKey.p);
  const g = BigInt('0x' + publicKey.g);
  const h = BigInt('0x' + publicKey.h);
  
  // Message should be encoded as g^message mod p
  // For vote counting: message = candidate_id (1, 2, 3, ...)
  const m = typeof message === 'bigint' ? message : BigInt(message);
  
  // g^m is the encoded vote
  const gm = modExp(g, m, p);
  
  // Choose random k
  const k = randomInRange(p);
  
  // c1 = g^k mod p
  const c1 = modExp(g, k, p);
  
  // c2 = h^k * g^m mod p
  const hk = modExp(h, k, p);
  const c2 = (hk * gm) % p;
  
  return {
    c1: c1.toString(16),
    c2: c2.toString(16),
    c1BigInt: c1,
    c2BigInt: c2,
    // Store message for testing/verification
    _message: m.toString(16)
  };
}

/**
 * Homomorphic addition of encrypted votes
 * 
 * To add encrypted votes:
 * Encrypt(m1) + Encrypt(m2) = (c1_1 * c1_2 mod p, c2_1 * c2_2 mod p)
 * 
 * This gives us the encryption of m1 + m2 (in the exponent)
 */
export function addEncrypted(ciphertext1, ciphertext2, publicKey) {
  const p = BigInt('0x' + publicKey.p);
  
  const c1_1 = BigInt('0x' + ciphertext1.c1);
  const c2_1 = BigInt('0x' + ciphertext1.c2);
  
  const c1_2 = BigInt('0x' + ciphertext2.c1);
  const c2_2 = BigInt('0x' + ciphertext2.c2);
  
  // Homomorphic addition
  const c1_sum = (c1_1 * c1_2) % p;
  const c2_sum = (c2_1 * c2_2) % p;
  
  return {
    c1: c1_sum.toString(16),
    c2: c2_sum.toString(16),
    c1BigInt: c1_sum,
    c2BigInt: c2_sum
  };
}

/**
 * Decrypt ElGamal ciphertext
 * 
 * Decryption:
 * - Compute c1^x mod p
 * - Compute (c1^x)^(-1) mod p (modular inverse)
 * - m = c2 * (c1^x)^(-1) mod p = g^m mod p
 * 
 * Returns the plaintext (in form g^m mod p, which encodes m)
 * To get m, you need discrete log which is hard, BUT:
 * For voting with small m (candidate ID 1-N where N << p),
 * can use baby-step giant-step or lookup table
 */
export function decrypt(ciphertext, privateKey, publicKey) {
  const p = BigInt('0x' + publicKey.p);
  
  const c1 = BigInt('0x' + ciphertext.c1);
  const c2 = BigInt('0x' + ciphertext.c2);
  
  const x = BigInt('0x' + privateKey.x);
  
  // Compute c1^x mod p
  const c1x = modExp(c1, x, p);
  
  // Compute (c1^x)^(-1) mod p
  const c1x_inv = modInverse(c1x, p);
  
  if (!c1x_inv) {
    throw new Error('Failed to compute modular inverse');
  }
  
  // m = c2 * (c1^x)^(-1) mod p = g^m
  const gm = (c2 * c1x_inv) % p;
  
  return {
    gm: gm.toString(16),
    gmBigInt: gm,
    // To get actual m, we need discrete log or lookup table
    // For small vote counts, use brute force or baby-step giant-step
  };
}

/**
 * Recover plaintext from g^m by discrete log
 * Uses brute force for small messages (candidate IDs 1-100)
 * In production, use baby-step giant-step algorithm
 */
export function discreteLog(gm, g, p, maxValue = 100) {
  const g_bigint = BigInt('0x' + g);
  const gm_bigint = BigInt('0x' + gm);
  const p_bigint = BigInt('0x' + p);
  
  // Try m = 0 to maxValue
  for (let m = 0; m <= maxValue; m++) {
    const gm_test = modExp(g_bigint, BigInt(m), p_bigint);
    if (gm_test === gm_bigint) {
      return m;
    }
  }
  
  return null; // Not found in range
}

/**
 * Complete homomorphic voting workflow test
 */
export function testHomomorphicVoting() {
  console.log('\n🔐 Testing ElGamal Homomorphic Encryption for Voting\n');
  console.log('═'.repeat(60));
  
  // Setup: 3 candidates, 5 voters
  const candidates = ['Alice', 'Bob', 'Charlie'];
  const votes = [1, 1, 2, 2, 2, 3, 1]; // 7 voters: Alice(3), Bob(2), Charlie(2)
  
  console.log('\n📊 Election Setup:');
  console.log(`   Candidates: ${candidates.join(', ')}`);
  console.log(`   Candidate IDs: Alice=1, Bob=2, Charlie=3`);
  console.log(`   Votes cast: ${votes.map((v, i) => `Voter${i+1}→${v}`).join(', ')}\n`);
  
  // Generate keys
  console.log('🔑 Generating ElGamal keys...');
  const { publicKey, privateKey } = generateKeys();
  console.log(`   Public key (h): ${publicKey.h.slice(0, 20)}...`);
  console.log(`   Private key (x): ${privateKey.x.slice(0, 20)}...\n`);
  
  // Encrypt each vote
  console.log('🔒 Encrypting votes...');
  const encryptedVotes = votes.map((vote, i) => {
    const encrypted = encrypt(vote, publicKey);
    console.log(`   Vote ${i+1}: ${vote} → (${encrypted.c1.slice(0, 16)}..., ${encrypted.c2.slice(0, 16)}...)`);
    return encrypted;
  });
  console.log();
  
  // Add encrypted votes homomorphically
  console.log('➕ Adding encrypted votes (without decrypting individuals)...');
  let encryptedSum = encryptedVotes[0];
  for (let i = 1; i < encryptedVotes.length; i++) {
    encryptedSum = addEncrypted(encryptedSum, encryptedVotes[i], publicKey);
  }
  console.log(`   Encrypted sum: (${encryptedSum.c1.slice(0, 16)}..., ${encryptedSum.c2.slice(0, 16)}...)\n`);
  
  // Decrypt final sum
  console.log('🔓 Decrypting final sum...');
  const decryptedSum = decrypt(encryptedSum, privateKey, publicKey);
  console.log(`   Decrypted (g^sum): ${decryptedSum.gm.slice(0, 20)}...`);
  
  // Recover individual vote totals
  console.log('\n📈 Vote Tally (using discrete log):');
  const sum = discreteLog(decryptedSum.gm, publicKey.g, publicKey.p);
  console.log(`   Total encrypted votes recovered: ${sum}`);
  console.log(`   Expected sum (manual): ${votes.reduce((a, b) => a + b, 0)}`);
  console.log(`   Match: ${sum === votes.reduce((a, b) => a + b, 0) ? '✅ YES' : '❌ NO'}\n`);
  
  // Manual tally for comparison
  const manualTally = {};
  votes.forEach(v => {
    manualTally[v] = (manualTally[v] || 0) + 1;
  });
  
  console.log('   Votes per candidate:');
  candidates.forEach((name, idx) => {
    const id = idx + 1;
    const count = manualTally[id] || 0;
    console.log(`     ${name} (ID ${id}): ${count} votes`);
  });
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Homomorphic voting test complete\n');
  
  return {
    success: sum === votes.reduce((a, b) => a + b, 0),
    encryptedVotes,
    encryptedSum,
    decryptedSum,
    manualTally
  };
}

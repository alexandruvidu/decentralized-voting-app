/**
 * Zero-Knowledge Proofs for Verifiable ElGamal Decryption
 * 
 * Implements Chaum-Pedersen proof protocol:
 * Proves that a decryption was performed correctly without revealing the private key
 * 
 * Protocol:
 * 1. Prover (has secret x) wants to prove: log_g(h) = log_{c1}(c2/m)
 *    - Where h = g^x (public key)
 *    - c1, c2 is the ciphertext
 *    - m is the claimed plaintext
 * 
 * 2. This proves decryption is correct:
 *    - c2 = h^k * m (encryption formula)
 *    - c2/m = h^k = (g^x)^k = g^(xk)
 *    - c1 = g^k
 *    - So log_g(h) = x = log_{c1}(c2/m) / k
 * 
 * 3. Fiat-Shamir heuristic: Make it non-interactive using hash function
 */

import crypto from 'crypto';

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
 * Modular inverse using Extended Euclidean Algorithm
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
 * Hash function for Fiat-Shamir transform
 * Converts multiple BigInts to a challenge value
 */
function hashToChallenge(p, ...values) {
  const hash = crypto.createHash('sha256');
  
  // Hash all values together
  for (const value of values) {
    const hex = value.toString(16);
    const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
    hash.update(Buffer.from(paddedHex, 'hex'));
  }
  
  const digest = hash.digest('hex');
  let challenge = BigInt('0x' + digest);
  
  // Reduce modulo p-1 to get a valid exponent
  challenge = challenge % (p - 1n);
  
  return challenge;
}

/**
 * Generate Chaum-Pedersen proof for correct ElGamal decryption
 * 
 * Proves: "I know x such that h = g^x AND (c2/m) = c1^x"
 * This proves m is the correct decryption of (c1, c2) under public key h
 * 
 * @param {Object} params
 * @param {bigint} params.g - Generator
 * @param {bigint} params.h - Public key (g^x)
 * @param {bigint} params.c1 - Ciphertext part 1 (g^k)
 * @param {bigint} params.c2 - Ciphertext part 2 (h^k * m)
 * @param {bigint} params.m - Claimed plaintext (g^vote_count)
 * @param {bigint} params.x - Private key (secret)
 * @param {bigint} params.p - Prime modulus
 * @returns {Object} Proof containing {a1, a2, z}
 */
export function generateDecryptionProof({ g, h, c1, c2, m, x, p }) {
  // Convert to BigInt if needed
  g = BigInt(g);
  h = BigInt(h);
  c1 = BigInt(c1);
  c2 = BigInt(c2);
  m = BigInt(m);
  x = BigInt(x);
  p = BigInt(p);
  
  // Step 1: Prover chooses random w in [2, p-2]
  const w = randomInRange(p);
  
  // Step 2: Compute commitments
  // a1 = g^w mod p
  const a1 = modExp(g, w, p);
  
  // a2 = c1^w mod p
  const a2 = modExp(c1, w, p);
  
  // Step 3: Compute challenge using Fiat-Shamir (non-interactive)
  // c = Hash(g, h, c1, c2, m, a1, a2)
  const c = hashToChallenge(p, g, h, c1, c2, m, a1, a2);
  
  // Step 4: Compute response
  // z = w - c*x mod (p-1)
  let z = (w - c * x) % (p - 1n);
  if (z < 0n) z += (p - 1n);
  
  return {
    a1: a1.toString(16),
    a2: a2.toString(16),
    z: z.toString(16),
    // Include challenge for verification
    c: c.toString(16)
  };
}

/**
 * Verify Chaum-Pedersen proof for correct ElGamal decryption
 * 
 * Verifies: "The prover knows x such that h = g^x AND (c2/m) = c1^x"
 * WITHOUT revealing x
 * 
 * @param {Object} params
 * @param {bigint} params.g - Generator
 * @param {bigint} params.h - Public key (g^x)
 * @param {bigint} params.c1 - Ciphertext part 1
 * @param {bigint} params.c2 - Ciphertext part 2
 * @param {bigint} params.m - Claimed plaintext
 * @param {bigint} params.p - Prime modulus
 * @param {Object} proof - Proof object {a1, a2, z, c}
 * @returns {boolean} True if proof is valid
 */
export function verifyDecryptionProof({ g, h, c1, c2, m, p }, proof) {
  // Convert to BigInt
  g = BigInt(g);
  h = BigInt(h);
  c1 = BigInt(c1);
  c2 = BigInt(c2);
  m = BigInt(m);
  p = BigInt(p);
  
  const a1 = BigInt('0x' + proof.a1);
  const a2 = BigInt('0x' + proof.a2);
  const z = BigInt('0x' + proof.z);
  
  // Recompute challenge
  const c = hashToChallenge(p, g, h, c1, c2, m, a1, a2);
  
  // Verify the proof:
  // Check 1: g^z * h^c = a1
  const left1 = (modExp(g, z, p) * modExp(h, c, p)) % p;
  const check1 = (left1 === a1);
  
  // Check 2: c1^z * (c2/m)^c = a2
  // First compute c2/m = c2 * m^(-1) mod p
  const m_inv = modInverse(m, p);
  if (!m_inv) {
    return false;
  }
  const c2_over_m = (c2 * m_inv) % p;
  
  const left2 = (modExp(c1, z, p) * modExp(c2_over_m, c, p)) % p;
  const check2 = (left2 === a2);
  
  return check1 && check2;
}

/**
 * Generate proof for each candidate's decrypted tally
 * 
 * @param {Object} params
 * @param {Object} params.publicKey - Public key {p, g, h}
 * @param {Object} params.privateKey - Private key {x}
 * @param {Array} params.encryptedTallies - Array of {candidate, c1, c2}
 * @param {Array} params.decryptedCounts - Array of {candidate, count, gm}
 * @returns {Array} Array of {candidate, count, proof}
 */
export function generateTallyProofs({ publicKey, privateKey, encryptedTallies, decryptedCounts }) {
  const p = BigInt('0x' + publicKey.p);
  const g = BigInt('0x' + publicKey.g);
  const h = BigInt('0x' + publicKey.h);
  const x = BigInt('0x' + privateKey.x);
  
  const proofs = [];
  
  for (let i = 0; i < encryptedTallies.length; i++) {
    const encrypted = encryptedTallies[i];
    const decrypted = decryptedCounts[i];
    
    const c1 = BigInt('0x' + encrypted.c1);
    const c2 = BigInt('0x' + encrypted.c2);
    const m = BigInt('0x' + decrypted.gm); // g^count
    
    // Generate proof for this candidate
    const proof = generateDecryptionProof({
      g, h, c1, c2, m, x, p
    });
    
    proofs.push({
      candidate: decrypted.candidate,
      count: decrypted.count,
      encryptedTally: {
        c1: encrypted.c1,
        c2: encrypted.c2
      },
      decryptedValue: decrypted.gm,
      proof
    });
  }
  
  return proofs;
}

/**
 * Verify all tally proofs
 * 
 * @param {Object} params
 * @param {Object} params.publicKey - Public key {p, g, h}
 * @param {Array} params.tallyProofs - Array of {candidate, count, encryptedTally, decryptedValue, proof}
 * @returns {Object} {valid: boolean, results: Array}
 */
export function verifyTallyProofs({ publicKey, tallyProofs }) {
  const p = BigInt('0x' + publicKey.p);
  const g = BigInt('0x' + publicKey.g);
  const h = BigInt('0x' + publicKey.h);
  
  const results = [];
  let allValid = true;
  
  for (const tallyProof of tallyProofs) {
    const c1 = BigInt('0x' + tallyProof.encryptedTally.c1);
    const c2 = BigInt('0x' + tallyProof.encryptedTally.c2);
    const m = BigInt('0x' + tallyProof.decryptedValue);
    
    const isValid = verifyDecryptionProof(
      { g, h, c1, c2, m, p },
      tallyProof.proof
    );
    
    results.push({
      candidate: tallyProof.candidate,
      count: tallyProof.count,
      valid: isValid
    });
    
    if (!isValid) {
      allValid = false;
    }
  }
  
  return {
    valid: allValid,
    results
  };
}

/**
 * Test the ZKP system
 */
export function testZKPDecryption() {
  console.log('\n🔐 Testing Zero-Knowledge Proof for Verifiable Decryption\n');
  console.log('═'.repeat(70));
  
  // Use the same prime as elgamal-crypto.js
  const p = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  const g = 2n;
  
  // Generate keys
  const x = randomInRange(p);
  const h = modExp(g, x, p);
  
  console.log('\n📊 Setup:');
  console.log(`   Prime p: ${p.toString(16).slice(0, 40)}...`);
  console.log(`   Generator g: ${g}`);
  console.log(`   Private key x: ${x.toString(16).slice(0, 40)}...`);
  console.log(`   Public key h: ${h.toString(16).slice(0, 40)}...\n`);
  
  // Encrypt a message (vote count = 42)
  const voteCount = 42n;
  const m = modExp(g, voteCount, p); // g^42
  
  // Simulate encryption (normally done by voter)
  const k = randomInRange(p); // random encryption key
  const c1 = modExp(g, k, p);
  const c2 = (modExp(h, k, p) * m) % p;
  
  console.log('🔒 Encrypted Vote:');
  console.log(`   Vote count: ${voteCount}`);
  console.log(`   Encoded as g^${voteCount} = ${m.toString(16).slice(0, 40)}...`);
  console.log(`   Ciphertext c1: ${c1.toString(16).slice(0, 40)}...`);
  console.log(`   Ciphertext c2: ${c2.toString(16).slice(0, 40)}...\n`);
  
  // Decrypt (done by election authority)
  const c1x = modExp(c1, x, p);
  const c1x_inv = modInverse(c1x, p);
  const decryptedM = (c2 * c1x_inv) % p;
  
  console.log('🔓 Decryption:');
  console.log(`   Decrypted g^m: ${decryptedM.toString(16).slice(0, 40)}...`);
  console.log(`   Matches original? ${decryptedM === m ? '✅ YES' : '❌ NO'}\n`);
  
  // Generate ZKP
  console.log('📝 Generating Zero-Knowledge Proof...');
  const proof = generateDecryptionProof({
    g, h, c1, c2, m: decryptedM, x, p
  });
  console.log(`   Commitment a1: ${proof.a1.slice(0, 40)}...`);
  console.log(`   Commitment a2: ${proof.a2.slice(0, 40)}...`);
  console.log(`   Challenge c: ${proof.c.slice(0, 40)}...`);
  console.log(`   Response z: ${proof.z.slice(0, 40)}...\n`);
  
  // Verify ZKP
  console.log('✅ Verifying Zero-Knowledge Proof...');
  const isValid = verifyDecryptionProof(
    { g, h, c1, c2, m: decryptedM, p },
    proof
  );
  console.log(`   Proof valid? ${isValid ? '✅ YES' : '❌ NO'}\n`);
  
  // Test with wrong decryption
  console.log('🔴 Testing with WRONG decryption...');
  const wrongM = modExp(g, 99n, p); // Wrong vote count
  const invalidProof = generateDecryptionProof({
    g, h, c1, c2, m: wrongM, x, p
  });
  const isInvalid = verifyDecryptionProof(
    { g, h, c1, c2, m: wrongM, p },
    invalidProof
  );
  console.log(`   Wrong proof should fail: ${!isInvalid ? '✅ FAILED as expected' : '❌ ERROR: proof passed!'}\n`);
  
  console.log('═'.repeat(70));
  console.log('✅ ZKP test complete\n');
  
  return {
    success: isValid && !isInvalid,
    proof,
    isValid,
    isInvalid
  };
}

// Export for use in other modules
export default {
  generateDecryptionProof,
  verifyDecryptionProof,
  generateTallyProofs,
  verifyTallyProofs,
  testZKPDecryption
};

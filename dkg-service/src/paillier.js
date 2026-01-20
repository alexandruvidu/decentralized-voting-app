/**
 * Paillier Homomorphic Encryption
 * 
 * Allows additive operations on encrypted values:
 * E(m1) * E(m2) = E(m1 + m2)  [modulo n²]
 * 
 * Properties:
 * - Partially homomorphic (additive only)
 * - Semantically secure
 * - No random padding needed per operation
 * - Efficient for vote tallying (E(vote1) + E(vote2) + ... = E(sum))
 */

import crypto from 'crypto';

/**
 * Paillier Key Pair
 */
export class PaillierKey {
  constructor(n, lambda, mu, g, nsquare) {
    this.n = n;           // modulus
    this.lambda = lambda; // Carmichael's totient
    this.mu = mu;         // precomputed μ = L(g^λ mod n²)^-1 mod n
    this.g = g;           // generator
    this.nsquare = nsquare; // n²
  }
}

/**
 * Generate Paillier key pair
 * Uses two large primes to create a secure encryption scheme
 */
export function generatePaillierKeyPair(bits = 2048) {
  // For demo/testing, use smaller keys. Production should use 2048+ bits
  const keyBits = bits / 2; // bits for each prime
  
  // Generate two large primes p and q
  const p = generateLargePrime(keyBits);
  const q = generateLargePrime(keyBits);
  
  // n = p * q
  const n = p * q;
  const nsquare = n * n;
  
  // λ = lcm(p-1, q-1)
  const lambda = lcm(p - 1n, q - 1n);
  
  // g = n + 1 (simplest choice, also known as Paillier's variant)
  const g = n + 1n;
  
  // Precompute μ = L(g^λ mod n²)^-1 mod n
  // where L(x) = (x - 1) / n
  const gToLambda = modPow(g, lambda, nsquare);
  const l = (gToLambda - 1n) / n;
  const mu = modInverse(l, n);
  
  const publicKey = new PaillierKey(n, undefined, undefined, g, nsquare);
  const privateKey = new PaillierKey(n, lambda, mu, g, nsquare);
  
  return {
    publicKey: {
      n: n.toString(),
      g: g.toString(),
      nsquare: nsquare.toString()
    },
    privateKey: {
      n: n.toString(),
      lambda: lambda.toString(),
      mu: mu.toString(),
      g: g.toString(),
      nsquare: nsquare.toString()
    }
  };
}

/**
 * Generate a large prime number
 */
function generateLargePrime(bits) {
  // For demo purposes, generate smaller primes
  // Production should use crypto.generatePrimeSync or similar
  while (true) {
    const candidate = BigInt(crypto.randomBytes(bits / 8).toString('hex'), 16);
    if (isProbablyPrime(candidate)) {
      return candidate;
    }
  }
}

/**
 * Miller-Rabin primality test
 */
function isProbablyPrime(n, k = 20) {
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;
  
  // Write n-1 as 2^r * d
  let d = n - 1n;
  let r = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    r++;
  }
  
  // Witness loop
  for (let i = 0; i < k; i++) {
    const a = 2n + BigInt(crypto.randomBytes(32).toString('hex'), 16) % (n - 3n);
    let x = modPow(a, d, n);
    
    if (x === 1n || x === n - 1n) continue;
    
    let continueWitnessLoop = false;
    for (let j = 0; j < r - 1n; j++) {
      x = modPow(x, 2n, n);
      if (x === n - 1n) {
        continueWitnessLoop = true;
        break;
      }
    }
    
    if (!continueWitnessLoop) return false;
  }
  
  return true;
}

/**
 * Least common multiple
 */
function lcm(a, b) {
  return (a * b) / gcd(a, b);
}

/**
 * Greatest common divisor (Euclidean algorithm)
 */
function gcd(a, b) {
  return b === 0n ? a : gcd(b, a % b);
}

/**
 * Modular exponentiation
 */
function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp >> 1n;
    base = (base * base) % mod;
  }
  
  return result;
}

/**
 * Modular inverse using extended Euclidean algorithm
 */
function modInverse(a, m) {
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  
  while (r !== 0n) {
    const quotient = old_r / r;
    [old_r, r] = [r, old_r - quotient * r];
    [old_s, s] = [s, old_s - quotient * s];
  }
  
  return old_s < 0n ? old_s + m : old_s;
}

/**
 * Encrypt a message with Paillier public key
 * Returns ciphertext that can be used in homomorphic operations
 */
export function paillierEncrypt(message, publicKeyObj) {
  const n = BigInt(publicKeyObj.n);
  const g = BigInt(publicKeyObj.g);
  const nsquare = BigInt(publicKeyObj.nsquare);
  
  const m = typeof message === 'bigint' ? message : BigInt(message);
  
  // Generate random r < n
  const r = BigInt(crypto.randomBytes(32).toString('hex'), 16) % n;
  
  // c = g^m * r^n mod n²
  const gm = modPow(g, m, nsquare);
  const rn = modPow(r, n, nsquare);
  const c = (gm * rn) % nsquare;
  
  return {
    ciphertext: c.toString(),
    n: n.toString(),
    nsquare: nsquare.toString()
  };
}

/**
 * Homomorphic addition of encrypted values
 * E(m1) * E(m2) = E(m1 + m2)
 */
export function paillierAdd(ciphertext1, ciphertext2, publicKeyObj) {
  const nsquare = BigInt(publicKeyObj.nsquare);
  const c1 = BigInt(ciphertext1);
  const c2 = BigInt(ciphertext2);
  
  // Multiply ciphertexts mod n²
  const result = (c1 * c2) % nsquare;
  
  return {
    ciphertext: result.toString(),
    nsquare: nsquare.toString()
  };
}

/**
 * Homomorphic scalar multiplication
 * E(m) * k = E(m * k)
 */
export function paillierScalarMultiply(ciphertext, scalar, publicKeyObj) {
  const nsquare = BigInt(publicKeyObj.nsquare);
  const c = BigInt(ciphertext);
  const k = typeof scalar === 'bigint' ? scalar : BigInt(scalar);
  
  // Exponentiate ciphertext by scalar
  const result = modPow(c, k, nsquare);
  
  return {
    ciphertext: result.toString(),
    nsquare: nsquare.toString()
  };
}

/**
 * Decrypt with Paillier private key
 */
export function paillierDecrypt(encryptedObj, privateKeyObj) {
  const n = BigInt(privateKeyObj.n);
  const lambda = BigInt(privateKeyObj.lambda);
  const mu = BigInt(privateKeyObj.mu);
  const nsquare = BigInt(privateKeyObj.nsquare);
  
  const c = typeof encryptedObj === 'object' 
    ? BigInt(encryptedObj.ciphertext) 
    : BigInt(encryptedObj);
  
  // m = L(c^λ mod n²) * μ mod n
  const cToLambda = modPow(c, lambda, nsquare);
  const l = (cToLambda - 1n) / n;
  const m = (l * mu) % n;
  
  return m;
}

/**
 * Test Paillier encryption and homomorphic operations
 */
export function testPaillier() {
  console.log('\n🔐 Testing Paillier Homomorphic Encryption\n');
  
  // Generate keys
  console.log('Generating Paillier key pair...');
  const { publicKey, privateKey } = generatePaillierKeyPair(512); // Smaller for testing
  console.log('✅ Key pair generated\n');
  
  // Test basic encryption/decryption
  console.log('Test 1: Basic Encryption/Decryption');
  const m1 = 5n;
  console.log(`  Message: ${m1}`);
  const encrypted1 = paillierEncrypt(m1, publicKey);
  console.log(`  Encrypted: ${encrypted1.ciphertext.slice(0, 32)}...`);
  const decrypted1 = paillierDecrypt(encrypted1, privateKey);
  console.log(`  Decrypted: ${decrypted1}`);
  console.log(`  Match: ${m1 === decrypted1 ? '✅ YES' : '❌ NO'}\n`);
  
  // Test homomorphic addition
  console.log('Test 2: Homomorphic Addition');
  const m2 = 3n;
  const m3 = 7n;
  console.log(`  Message 1: ${m2}`);
  console.log(`  Message 2: ${m3}`);
  
  const e2 = paillierEncrypt(m2, publicKey);
  const e3 = paillierEncrypt(m3, publicKey);
  console.log(`  Encrypted message 1: ${e2.ciphertext.slice(0, 32)}...`);
  console.log(`  Encrypted message 2: ${e3.ciphertext.slice(0, 32)}...`);
  
  // Add encrypted values
  const eSum = paillierAdd(e2.ciphertext, e3.ciphertext, publicKey);
  console.log(`  E(m1) + E(m2): ${eSum.ciphertext.slice(0, 32)}...`);
  
  const decryptedSum = paillierDecrypt(eSum, privateKey);
  const expectedSum = m2 + m3;
  console.log(`  Decrypted sum: ${decryptedSum}`);
  console.log(`  Expected: ${expectedSum}`);
  console.log(`  Match: ${decryptedSum === expectedSum ? '✅ YES' : '❌ NO'}\n`);
  
  // Test scalar multiplication
  console.log('Test 3: Homomorphic Scalar Multiplication');
  const m4 = 10n;
  const scalar = 5n;
  console.log(`  Message: ${m4}`);
  console.log(`  Scalar: ${scalar}`);
  
  const e4 = paillierEncrypt(m4, publicKey);
  const eScaled = paillierScalarMultiply(e4.ciphertext, scalar, publicKey);
  
  const decryptedScaled = paillierDecrypt(eScaled, privateKey);
  const expectedScaled = m4 * scalar;
  console.log(`  E(m) * k: ${eScaled.ciphertext.slice(0, 32)}...`);
  console.log(`  Decrypted: ${decryptedScaled}`);
  console.log(`  Expected: ${expectedScaled}`);
  console.log(`  Match: ${decryptedScaled === expectedScaled ? '✅ YES' : '❌ NO'}\n`);
  
  return {
    test1Passed: m1 === decrypted1,
    test2Passed: decryptedSum === expectedSum,
    test3Passed: decryptedScaled === expectedScaled,
    allPassed: m1 === decrypted1 && decryptedSum === expectedSum && decryptedScaled === expectedScaled
  };
}

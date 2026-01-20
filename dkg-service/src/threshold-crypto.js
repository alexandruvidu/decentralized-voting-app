/**
 * Threshold Cryptography using Shamir Secret Sharing (3-of-5)
 * Splits a private key into 5 shares where any 3 can reconstruct the key
 */

import crypto from 'crypto';

/**
 * Generate a random polynomial coefficient
 */
export function randomPolynomialCoefficient() {
  return crypto.randomBytes(32);
}

/**
 * Evaluate polynomial at x using Horner's method
 * Polynomial: a0 + a1*x + a2*x^2 + ... + an*x^n
 * All arithmetic is modulo a large prime
 */
function evaluatePolynomial(coefficients, x, prime) {
  let result = 0n;
  
  // Horner's method: evaluate from highest degree down
  for (let i = coefficients.length - 1; i >= 0; i--) {
    const coeff = BigInt('0x' + coefficients[i].toString('hex'));
    result = (result * BigInt(x) + coeff) % prime;
  }
  
  return result;
}

/**
 * Extended Euclidean algorithm - find modular inverse
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
 * Lagrange interpolation at x=0 to recover secret
 * Given k points (x_i, y_i), reconstruct y(0) = secret
 */
export function lagrangeInterpolate(shares, prime) {
  // shares is array of { x, y } where y = f(x) mod prime
  if (shares.length < 3) {
    throw new Error('Need at least 3 shares to reconstruct');
  }
  
  let secret = 0n;
  const k = BigInt(shares.length);
  const p = BigInt(prime);
  
  for (let i = 0; i < shares.length; i++) {
    let numerator = 1n;
    let denominator = 1n;
    
    const xi = BigInt(shares[i].x);
    const yi = BigInt(shares[i].y);
    
    for (let j = 0; j < shares.length; j++) {
      if (i !== j) {
        const xj = BigInt(shares[j].x);
        
        // numerator *= (0 - xj) = -xj
        numerator = (numerator * ((p - xj) % p)) % p;
        
        // denominator *= (xi - xj)
        denominator = (denominator * ((xi - xj + p) % p)) % p;
      }
    }
    
    // Calculate modular inverse of denominator
    const denomInv = modInverse(denominator, p);
    if (!denomInv) {
      throw new Error('Failed to compute modular inverse');
    }
    
    // Lagrange basis: l_i(0) = numerator / denominator
    const basis = (numerator * denomInv) % p;
    
    // Add contribution to secret
    secret = (secret + ((yi * basis) % p)) % p;
  }
  
  return ((secret % p) + p) % p; // Ensure positive
}

/**
 * Generate Shamir Secret Shares (3-of-5 threshold)
 * Takes a secret and generates 5 shares where any 3 can reconstruct
 */
export function generateShares(secret, threshold = 3, totalShares = 5) {
  // Large prime for modular arithmetic (2^256 - 2^32 - 977)
  const prime = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
  
  if (threshold > totalShares) {
    throw new Error('Threshold cannot be greater than total shares');
  }
  
  // Convert secret to BigInt
  const secretBigInt = typeof secret === 'string' 
    ? BigInt('0x' + secret)
    : BigInt(secret);
  
  // Create polynomial: a0 + a1*x + a2*x^2 + ... + a(t-1)*x^(t-1)
  // where a0 = secret and a1, a2, ..., a(t-1) are random coefficients
  const coefficients = [
    Buffer.from(secretBigInt.toString(16).padStart(64, '0'), 'hex')
  ];
  
  for (let i = 1; i < threshold; i++) {
    coefficients.push(randomPolynomialCoefficient());
  }
  
  // Generate shares by evaluating polynomial at x = 1, 2, 3, 4, 5
  const shares = [];
  for (let x = 1; x <= totalShares; x++) {
    const y = evaluatePolynomial(coefficients, x, prime);
    shares.push({
      x: x,
      y: y,
      yHex: '0x' + y.toString(16).padStart(64, '0')
    });
  }
  
  return {
    shares,
    coefficients: coefficients.map(c => c.toString('hex')),
    prime: prime.toString()
  };
}

/**
 * Verify that shares are consistent with the public coefficients
 */
export function verifyShare(share, publicCoefficients, prime) {
  const p = BigInt(prime);
  
  // Reconstruct the public evaluation point using Horner's method
  let expected = 0n;
  for (let i = publicCoefficients.length - 1; i >= 0; i--) {
    const coeff = BigInt('0x' + publicCoefficients[i]);
    expected = (expected * BigInt(share.x) + coeff) % p;
  }
  
  const actual = BigInt(share.yHex);
  return expected === actual;
}

/**
 * Reconstruct secret from shares using Lagrange interpolation
 */
export function reconstructSecret(shares, prime) {
  if (shares.length < 3) {
    throw new Error('Need at least 3 shares to reconstruct');
  }
  
  const shareObjects = shares.map(s => ({
    x: s.x,
    y: BigInt(s.yHex || s.y)
  }));
  
  const secretBigInt = lagrangeInterpolate(shareObjects, BigInt(prime));
  return secretBigInt.toString(16).padStart(64, '0');
}

/**
 * Create verification hashes for shares
 * Used to verify shares haven't been tampered with
 */
export function createVerificationHash(share) {
  const data = `${share.x}:${share.yHex}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Test DKG with 3-of-5 threshold
 */
export function testDKG() {
  console.log('🔐 Testing 3-of-5 Shamir Secret Sharing\n');
  
  // Generate a random secret (private key)
  const secret = crypto.randomBytes(32).toString('hex');
  console.log(`Secret: ${secret.slice(0, 16)}...\n`);
  
  // Split into 5 shares, need 3 to reconstruct
  const { shares, coefficients, prime } = generateShares(secret, 3, 5);
  
  console.log('Generated 5 shares:');
  shares.forEach((share, i) => {
    const hash = createVerificationHash(share);
    console.log(`  Share ${share.x}: ${share.yHex.slice(0, 16)}... (hash: ${hash.slice(0, 16)}...)`);
  });
  
  console.log('\nPublic coefficients (for verification):');
  coefficients.forEach((coeff, i) => {
    console.log(`  A${i}: ${coeff.slice(0, 16)}...`);
  });
  
  // Test reconstruction with 3 shares
  console.log('\nReconstructing with shares 1, 3, 5...');
  const reconstructed = reconstructSecret([shares[0], shares[2], shares[4]], prime);
  
  const match = reconstructed === secret;
  console.log(`Original:      ${secret.slice(0, 32)}...`);
  console.log(`Reconstructed: ${reconstructed.slice(0, 32)}...`);
  console.log(`Match: ${match ? '✅ YES' : '❌ NO'}\n`);
  
  // Test with different combination
  console.log('Reconstructing with shares 2, 3, 4...');
  const reconstructed2 = reconstructSecret([shares[1], shares[2], shares[3]], prime);
  const match2 = reconstructed2 === secret;
  console.log(`Match: ${match2 ? '✅ YES' : '❌ NO'}\n`);
  
  return {
    secret,
    shares,
    coefficients,
    prime,
    testsPassed: match && match2
  };
}

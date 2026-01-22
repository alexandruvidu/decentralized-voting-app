/**
 * Zero-Knowledge Proofs for Verifiable ElGamal Decryption
 * 
 * Implements Chaum-Pedersen proof protocol for the decryption service
 */

import crypto from 'crypto';
import { modPow, modInverse } from './crypto.js';

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
 */
function hashToChallenge(p, ...values) {
  const hash = crypto.createHash('sha256');
  
  for (const value of values) {
    const hex = value.toString(16);
    const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
    hash.update(Buffer.from(paddedHex, 'hex'));
  }
  
  const digest = hash.digest('hex');
  let challenge = BigInt('0x' + digest);
  challenge = challenge % (p - 1n);
  
  return challenge;
}

/**
 * Generate Chaum-Pedersen proof for correct ElGamal decryption
 */
export function generateDecryptionProof({ g, h, c1, c2, m, x, p }) {
  g = BigInt(g);
  h = BigInt(h);
  c1 = BigInt(c1);
  c2 = BigInt(c2);
  m = BigInt(m);
  x = BigInt(x);
  p = BigInt(p);
  
  const w = randomInRange(p);
  const a1 = modPow(g, w, p);
  const a2 = modPow(c1, w, p);
  const c = hashToChallenge(p, g, h, c1, c2, m, a1, a2);
  
  let z = (w - c * x) % (p - 1n);
  if (z < 0n) z += (p - 1n);
  
  return {
    a1: a1.toString(16),
    a2: a2.toString(16),
    z: z.toString(16),
    c: c.toString(16)
  };
}

/**
 * Verify Chaum-Pedersen proof for correct ElGamal decryption
 */
export function verifyDecryptionProof({ g, h, c1, c2, m, p }, proof) {
  g = BigInt(g);
  h = BigInt(h);
  c1 = BigInt(c1);
  c2 = BigInt(c2);
  m = BigInt(m);
  p = BigInt(p);
  
  const a1 = BigInt('0x' + proof.a1);
  const a2 = BigInt('0x' + proof.a2);
  const z = BigInt('0x' + proof.z);
  
  const c = hashToChallenge(p, g, h, c1, c2, m, a1, a2);
  
  const left1 = (modPow(g, z, p) * modPow(h, c, p)) % p;
  const check1 = (left1 === a1);
  
  const m_inv = modInverse(m, p);
  if (!m_inv) return false;
  
  const c2_over_m = (c2 * m_inv) % p;
  const left2 = (modPow(c1, z, p) * modPow(c2_over_m, c, p)) % p;
  const check2 = (left2 === a2);
  
  return check1 && check2;
}

/**
 * Generate proofs for all candidate tallies
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
    const m = BigInt('0x' + decrypted.gm);
    
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
  
  return { valid: allValid, results };
}

export default {
  generateDecryptionProof,
  verifyDecryptionProof,
  generateTallyProofs,
  verifyTallyProofs
};

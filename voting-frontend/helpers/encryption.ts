/**
 * Encryption utilities for threshold-encrypted voting
 * Uses NaCl (TweetNaCl) for X25519-XSalsa20-Poly1305 authenticated encryption
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

/**
 * Encrypts a candidate index for threshold-encrypted voting
 * @param candidateIndex The index of the candidate (0, 1, 2, etc.)
 * @param publicKeyBase64 The election's public key (base64 encoded)
 * @returns Base64 encoded encrypted vote (nonce + ciphertext)
 */
export function encryptVote(candidateIndex: number, publicKeyBase64: string): string {
  // Generate an ephemeral keypair for this vote
  const ephemeralKeyPair = nacl.box.keyPair();
  
  // Decode the election's public key
  const electionPublicKey = naclUtil.decodeBase64(publicKeyBase64);
  
  // Convert candidate index to bytes (UTF-8 string)
  const message = naclUtil.decodeUTF8(candidateIndex.toString());
  
  // Generate a random nonce
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  // Encrypt the vote using NaCl box (authenticated encryption)
  const ciphertext = nacl.box(
    message,
    nonce,
    electionPublicKey,
    ephemeralKeyPair.secretKey
  );
  
  if (!ciphertext) {
    throw new Error('Encryption failed');
  }
  
  // Combine nonce + ciphertext for storage
  const encryptedVote = new Uint8Array(nonce.length + ciphertext.length);
  encryptedVote.set(nonce);
  encryptedVote.set(ciphertext, nonce.length);
  
  // Return as base64
  return naclUtil.encodeBase64(encryptedVote);
}

/**
 * Validates that a public key is properly formatted
 * @param publicKeyBase64 The public key to validate
 * @returns true if valid, false otherwise
 */
export function validatePublicKey(publicKeyBase64: string): boolean {
  try {
    const decoded = naclUtil.decodeBase64(publicKeyBase64);
    return decoded.length === nacl.box.publicKeyLength;
  } catch {
    return false;
  }
}

/**
 * Decrypts a vote (for testing/verification purposes only)
 * In production, only authorities with key shares can decrypt
 * @param encryptedVoteBase64 The encrypted vote
 * @param privateKeyBase64 The private key
 * @param publicKeyBase64 The public key
 * @returns The decrypted candidate index
 */
export function decryptVote(
  encryptedVoteBase64: string,
  privateKeyBase64: string,
  publicKeyBase64: string
): number | null {
  try {
    const encryptedBytes = naclUtil.decodeBase64(encryptedVoteBase64);
    const privateKey = naclUtil.decodeBase64(privateKeyBase64);
    const publicKey = naclUtil.decodeBase64(publicKeyBase64);
    
    // Extract nonce and ciphertext
    const nonce = encryptedBytes.slice(0, nacl.box.nonceLength);
    const ciphertext = encryptedBytes.slice(nacl.box.nonceLength);
    
    // Decrypt
    const decrypted = nacl.box.open(ciphertext, nonce, publicKey, privateKey);
    
    if (!decrypted) {
      return null;
    }
    
    // Parse candidate index
    return parseInt(naclUtil.encodeUTF8(decrypted), 10);
  } catch {
    return null;
  }
}

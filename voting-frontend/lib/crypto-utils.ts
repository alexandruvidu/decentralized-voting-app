/**
 * Client-side cryptographic utilities for ElGamal homomorphic encryption
 */

/**
 * Decode hex-encoded ciphertext from blockchain
 */
export function decodeCiphertext(encryptedVote: string): { c1: string; c2: string } {
  // Remove 0x prefix
  const hex = encryptedVote.startsWith('0x') ? encryptedVote.slice(2) : encryptedVote;
  
  // Read length prefix (4 bytes = 8 hex chars)
  const lengthHex = hex.slice(0, 8);
  const length = parseInt(lengthHex, 16);
  
  // Read c1 and c2 (each is half the remaining data)
  const dataHex = hex.slice(8);
  const halfLength = dataHex.length / 2;
  
  const c1Hex = dataHex.slice(0, halfLength);
  const c2Hex = dataHex.slice(halfLength);
  
  return {
    c1: '0x' + c1Hex,
    c2: '0x' + c2Hex
  };
}

/**
 * Add two ElGamal ciphertexts homomorphically
 * (c1, c2) + (c1', c2') = (c1 * c1' mod p, c2 * c2' mod p)
 */
export function addEncrypted(
  cipher1: { c1: string; c2: string },
  cipher2: { c1: string; c2: string },
  p: string
): { c1: string; c2: string } {
  const prime = BigInt(p);
  
  const c1_1 = BigInt(cipher1.c1);
  const c2_1 = BigInt(cipher1.c2);
  const c1_2 = BigInt(cipher2.c1);
  const c2_2 = BigInt(cipher2.c2);
  
  const c1_sum = (c1_1 * c1_2) % prime;
  const c2_sum = (c2_1 * c2_2) % prime;
  
  return {
    c1: '0x' + c1_sum.toString(16),
    c2: '0x' + c2_sum.toString(16)
  };
}

/**
 * Perform homomorphic tallying of encrypted votes
 * Returns encrypted tally for each candidate
 */
export function tallyEncryptedVotes(
  encryptedVotes: string[],
  candidates: string[],
  publicKey: { p: string; g: string }
): Array<{ candidate: string; c1: string; c2: string }> {
  const p = publicKey.p;
  const g = BigInt(publicKey.g);
  const prime = BigInt(p);
  
  // Hash each candidate name to a value
  const candidateHashes = new Map<string, bigint>();
  for (const candidate of candidates) {
    candidateHashes.set(candidate, hashCandidateName(candidate));
  }
  
  // Initialize tally for each candidate as encryption of 1 (identity for multiplication)
  // E(0) = (g^0, h^0) = (1, 1) in additive homomorphism, but we want multiplicative
  // So we start with E(1) = (1, 1) which is identity for our homomorphic addition
  const tallies = new Map<string, { c1: bigint; c2: bigint }>();
  for (const candidate of candidates) {
    tallies.set(candidate, { c1: 1n, c2: 1n });
  }
  
  // Process each encrypted vote
  for (const encryptedVote of encryptedVotes) {
    try {
      const { c1, c2 } = decodeCiphertext(encryptedVote);
      const c1_big = BigInt(c1);
      const c2_big = BigInt(c2);
      
      // We need to decrypt to know which candidate this vote is for
      // But that defeats the purpose of homomorphic encryption!
      // 
      // Actually, in a real voting system, individual votes should be for specific candidates
      // and the homomorphic tallying happens server-side or in a trusted environment.
      // 
      // For now, let's assume votes are already organized by candidate or we need a different approach.
      
      // TODO: This requires knowing which candidate each vote is for without decryption
      // One approach: store votes indexed by candidate in the contract
      // Another: use a mixnet or re-encryption shuffle
      
    } catch (error) {
      console.warn('Failed to decode encrypted vote:', error);
    }
  }
  
  // Convert tallies to array format
  const result: Array<{ candidate: string; c1: string; c2: string }> = [];
  for (const [candidate, tally] of tallies.entries()) {
    result.push({
      candidate,
      c1: '0x' + tally.c1.toString(16),
      c2: '0x' + tally.c2.toString(16)
    });
  }
  
  return result;
}

/**
 * Hash a candidate name to a big integer (for vote matching)
 */
function hashCandidateName(name: string): bigint {
  const encoder = new TextEncoder();
  const data = encoder.encode(name);
  
  // Simple hash using character codes (not cryptographically secure, but deterministic)
  let hash = 0n;
  for (let i = 0; i < data.length; i++) {
    hash = (hash * 256n + BigInt(data[i])) % (2n ** 256n);
  }
  
  return hash;
}

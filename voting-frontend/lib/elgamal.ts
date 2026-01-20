/**
 * ElGamal Encryption for Homomorphic Voting
 * Client-side encryption of votes using threshold cryptography public key
 */

/**
 * Parse the binary-encoded public key from contract
 * Format: p (big int) || g (big int) || h (big int)
 * Each as variable-length big-endian bytes with length prefix
 */
export function parsePublicKey(encodedKey: string): {
  p: bigint;
  g: bigint;
  h: bigint;
} {
  // Convert hex string to Uint8Array (browser-compatible, no Node.js Buffer)
  const bytes = new Uint8Array(encodedKey.length / 2);
  for (let i = 0; i < encodedKey.length; i += 2) {
    bytes[i / 2] = parseInt(encodedKey.substr(i, 2), 16);
  }
  const buffer = bytes;
  let offset = 0;

  // Helper to read a big-endian variable-length integer
  const readBigInt = (): bigint => {
    // First 4 bytes = length (big-endian)
    const length = 
      ((buffer[offset] << 24) | 
       (buffer[offset + 1] << 16) | 
       (buffer[offset + 2] << 8) | 
       buffer[offset + 3]) >>> 0; // Unsigned 32-bit
    offset += 4;
    
    // Read the bytes and convert to bigint
    const bytes = buffer.slice(offset, offset + length);
    offset += length;
    
    let result = 0n;
    for (const byte of bytes) {
      result = (result << 8n) | BigInt(byte);
    }
    return result;
  };

  const p = readBigInt();
  const g = readBigInt();
  const h = readBigInt();

  return { p, g, h };
}

/**
 * Simple ElGamal encryption (async to avoid blocking UI)
 * Encrypts a message m as: c1 = g^r mod p, c2 = h^r * m mod p
 * where r is a random number < p
 */
export async function elgamalEncrypt(
  message: bigint,
  publicKey: { p: bigint; g: bigint; h: bigint }
): Promise<{ c1: bigint; c2: bigint }> {
  const { p, g, h } = publicKey;

  // Generate random r in [1, p-2]
  const r = randomBigInt(1n, p - 2n);

  // Do expensive modular exponentiation in chunks to keep UI responsive
  // c1 = g^r mod p
  const c1 = await modPowAsync(g, r, p);

  // c2 = (h^r * m) mod p
  const hr = await modPowAsync(h, r, p);
  const c2 = (hr * message) % p;

  return { c1, c2 };
}

/**
 * Encode ElGamal ciphertext as binary for contract submission
 * Format: c1_length || c1_bytes || c2_length || c2_bytes
 * Uses browser-compatible Uint8Array instead of Node.js Buffer
 */
export function encodeCiphertext(c1: bigint, c2: bigint): string {
  const c1Bytes = bigIntToBytes(c1);
  const c2Bytes = bigIntToBytes(c2);

  // Create Uint8Array for the combined buffer
  const totalLength = 4 + c1Bytes.length + 4 + c2Bytes.length;
  const buffer = new Uint8Array(totalLength);
  let offset = 0;

  // Write c1 length (big-endian u32)
  buffer[offset++] = (c1Bytes.length >> 24) & 0xff;
  buffer[offset++] = (c1Bytes.length >> 16) & 0xff;
  buffer[offset++] = (c1Bytes.length >> 8) & 0xff;
  buffer[offset++] = c1Bytes.length & 0xff;

  // Write c1 bytes
  buffer.set(c1Bytes, offset);
  offset += c1Bytes.length;

  // Write c2 length (big-endian u32)
  buffer[offset++] = (c2Bytes.length >> 24) & 0xff;
  buffer[offset++] = (c2Bytes.length >> 16) & 0xff;
  buffer[offset++] = (c2Bytes.length >> 8) & 0xff;
  buffer[offset++] = c2Bytes.length & 0xff;

  // Write c2 bytes
  buffer.set(c2Bytes, offset);

  // Convert to hex string
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Helper: modular exponentiation (async version to avoid UI blocking)
 * Uses iterative binary exponentiation with periodic yields to keep UI responsive
 * For 2048-bit numbers, yield every 10 iterations to prevent blocking
 */
async function modPowAsync(base: bigint, exponent: bigint, modulus: bigint): Promise<bigint> {
  let result = 1n;
  base = base % modulus;
  let exp = exponent;

  let iterations = 0;
  const startTime = Date.now();
  
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % modulus;
    }
    exp = exp >> 1n;
    base = (base * base) % modulus;

    // Yield to event loop more frequently for large numbers
    // Check every 10 iterations or every 100ms
    iterations++;
    if (iterations % 10 === 0 || Date.now() - startTime > 100) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return result;
}

/**
 * Helper: modular exponentiation (synchronous for small exponents)
 */
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  base = base % modulus;

  while (exponent > 0n) {
    if (exponent % 2n === 1n) {
      result = (result * base) % modulus;
    }
    exponent = exponent >> 1n;
    base = (base * base) % modulus;
  }

  return result;
}

/**
 * Helper: generate random bigint in range [min, max]
 */
function randomBigInt(min: bigint, max: bigint): bigint {
  const range = max - min + 1n;
  const bitsNeeded = range.toString(2).length;
  
  let random: bigint;
  do {
    random = 0n;
    for (let i = 0; i < bitsNeeded; i++) {
      random = (random << 1n) | BigInt(Math.random() > 0.5 ? 1 : 0);
    }
  } while (random >= range);

  return min + random;
}

/**
 * Helper: convert bigint to big-endian bytes (browser-compatible)
 */
function bigIntToBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array([0]);

  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xFFn));
    n = n >> 8n;
  }

  return new Uint8Array(bytes);
}

/**
 * Encode a candidate choice as a number for encryption
 * Uses browser-native SubtleCrypto for hashing
 */
export async function encodeCandidateChoice(candidateName: string): Promise<bigint> {
  // Use browser's Web Crypto API for hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(candidateName);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert hash to bigint
  let result = 0n;
  const hashArray = new Uint8Array(hashBuffer);
  for (const byte of hashArray) {
    result = (result << 8n) | BigInt(byte);
  }
  
  return result;
}

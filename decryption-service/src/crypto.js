/**
 * Cryptographic Utilities
 * 
 * ElGamal encryption/decryption primitives
 * - Modular exponentiation
 * - Modular inverse
 * - Ciphertext encoding/decoding
 * - Candidate name hashing
 */

import crypto from 'crypto';

// ---------- Shared helpers for encryption/decryption ----------

export function bigIntToBytes(bigInt) {
  const hex = bigInt.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
  return Buffer.from(paddedHex, 'hex');
}

export function randomBigInt(min, max) {
  const range = max - min + 1n;
  const bits = range.toString(2).length;
  const bytes = Math.ceil(bits / 8);
  let random;
  do {
    const randomBytes = crypto.randomBytes(bytes);
    random = BigInt('0x' + randomBytes.toString('hex'));
  } while (random >= range);
  return min + random;
}

/**
 * Modular exponentiation: (base^exponent) % modulus
 * Uses JavaScript's built-in BigInt support for large numbers
 */
export function modPow(base, exponent, modulus) {
  if (modulus === 1n) return 0n;
  
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
 * Extended Euclidean Algorithm
 * Returns: [gcd, x, y] where gcd = a*x + b*y
 */
function extendedGcd(a, b) {
  if (b === 0n) {
    return [a, 1n, 0n];
  }
  
  const [gcd, x1, y1] = extendedGcd(b, a % b);
  const x = y1;
  const y = x1 - (a / b) * y1;
  
  return [gcd, x, y];
}

/**
 * Modular multiplicative inverse: a^(-1) mod m
 * Returns: x where (a * x) % m = 1
 */
export function modInverse(a, m) {
  const [gcd, x, _] = extendedGcd(a, m);
  
  if (gcd !== 1n) {
    throw new Error('Modular inverse does not exist');
  }
  
  return (x % m + m) % m;
}

/**
 * Decode ElGamal ciphertext from hex string
 * 
 * Format: 4 bytes (c1 length) + c1 + 4 bytes (c2 length) + c2
 * 
 * @param {string} hexString - Hex-encoded ciphertext (0x prefixed)
 * @returns {{c1: bigint, c2: bigint}}
 */
export function decodeCiphertext(hexString) {
  // Remove 0x prefix if present
  const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
  const buffer = Buffer.from(hex, 'hex');
  
  let offset = 0;
  
  // Read c1 length (4 bytes, big-endian)
  const c1Length = buffer.readUInt32BE(offset);
  offset += 4;
  
  // Read c1
  const c1Buffer = buffer.slice(offset, offset + c1Length);
  const c1 = BigInt('0x' + c1Buffer.toString('hex'));
  offset += c1Length;
  
  // Read c2 length (4 bytes, big-endian)
  const c2Length = buffer.readUInt32BE(offset);
  offset += 4;
  
  // Read c2
  const c2Buffer = buffer.slice(offset, offset + c2Length);
  const c2 = BigInt('0x' + c2Buffer.toString('hex'));
  
  return { c1, c2 };
}

/**
 * Decode public key from hex string
 * 
 * Format (from contract):
 * - Option flag (1 byte): 0x01 for Some, 0x00 for None
 * - Length (4 bytes)
 * - Key data
 * 
 * @param {string} hexString - Hex-encoded public key
 * @returns {bigint} - Public key h
 */
export function decodePublicKey(hexString) {
  const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
  const buffer = Buffer.from(hex, 'hex');
  
  let offset = 0;
  
  // Check Option flag
  const optionFlag = buffer.readUInt8(offset);
  offset += 1;
  
  if (optionFlag === 0x00) {
    throw new Error('Public key is None (not set)');
  }
  
  // Read length
  const length = buffer.readUInt32BE(offset);
  offset += 4;
  
  // Read key
  const keyBuffer = buffer.slice(offset, offset + length);
  const key = BigInt('0x' + keyBuffer.toString('hex'));
  
  return key;
}

/**
 * Encode candidate name to bigint (for encryption)
 * Uses SHA-256 hash and converts to bigint
 * 
 * @param {string} candidateName
 * @returns {bigint}
 */
export function encodeCandidateName(candidateName) {
  const hash = crypto.createHash('sha256')
    .update(candidateName)
    .digest();
  
  return BigInt('0x' + hash.toString('hex'));
}

/**
 * Try to reverse-map a decrypted message hash back to a candidate name
 * 
 * @param {bigint} messageHash - Decrypted message
 * @param {string[]} candidates - List of candidate names
 * @returns {string|null} - Matching candidate name or null
 */
export function hashToCandidate(messageHash, candidates) {
  for (const candidate of candidates) {
    const hash = encodeCandidateName(candidate);
    if (hash === messageHash) {
      return candidate;
    }
  }
  return null;
}

/**
 * Encode ciphertext as binary: c1_length || c1 || c2_length || c2 (hex)
 */
export function encodeCiphertext(c1, c2) {
  const c1Bytes = bigIntToBytes(c1);
  const c2Bytes = bigIntToBytes(c2);
  const buffer = Buffer.alloc(4 + c1Bytes.length + 4 + c2Bytes.length);
  let offset = 0;
  buffer.writeUInt32BE(c1Bytes.length, offset);
  offset += 4;
  c1Bytes.copy(buffer, offset);
  offset += c1Bytes.length;
  buffer.writeUInt32BE(c2Bytes.length, offset);
  offset += 4;
  c2Bytes.copy(buffer, offset);
  return buffer.toString('hex');
}

/**
 * Validate ElGamal key parameters
 * 
 * @param {bigint} p - Prime modulus
 * @param {bigint} g - Generator
 * @param {bigint} h - Public key (g^x mod p)
 * @returns {boolean}
 */
export function validateKeyParameters(p, g, h) {
  // Check p is odd (required for prime)
  if (p % 2n === 0n) {
    return false;
  }
  
  // Check g is in valid range
  if (g <= 1n || g >= p) {
    return false;
  }
  
  // Check h is in valid range
  if (h <= 0n || h >= p) {
    return false;
  }
  
  return true;
}

/**
 * RFC 3526 Group 14 (2048-bit MODP group)
 * Default parameters for ElGamal when not provided
 */
export const DEFAULT_ELGAMAL_PARAMS = {
  p: BigInt('0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF'),
  g: 2n
};

/**
 * Parse public key from hex (length-prefixed h) or direct h
 * Supports custom P, G, H encoded as: len(P) | P | len(G) | G | len(H) | H
 */
export function parsePublicKeyFromHex(publicKeyHex) {
  let hex = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }
  const buffer = Buffer.from(hex, 'hex');

  // Try to parse as P, G, H blob
  try {
    let offset = 0;
    
    // Check if we have enough bytes for at least 3 lengths (12 bytes)
    if (buffer.length > 12) {
      // Read P
      const pLen = buffer.readUInt32BE(offset);
      offset += 4;
      if (pLen > 0 && offset + pLen <= buffer.length) {
        const pBytes = buffer.slice(offset, offset + pLen);
        offset += pLen;
        
        // Read G
        if (offset + 4 <= buffer.length) {
          const gLen = buffer.readUInt32BE(offset);
          offset += 4;
          if (gLen > 0 && offset + gLen <= buffer.length) {
            const gBytes = buffer.slice(offset, offset + gLen);
            offset += gLen;
            
            // Read H
            if (offset + 4 <= buffer.length) {
              const hLen = buffer.readUInt32BE(offset);
              offset += 4;
              if (hLen > 0 && offset + hLen <= buffer.length) {
                const hBytes = buffer.slice(offset, offset + hLen);
                
                // Successfully parsed all 3 components
                return {
                  p: BigInt('0x' + pBytes.toString('hex')),
                  g: BigInt('0x' + gBytes.toString('hex')),
                  h: BigInt('0x' + hBytes.toString('hex'))
                };
              }
            }
          }
        }
      }
    }
  } catch (e) {
    // Ignore parsing errors and fall back
  }

  // Fallback: Assume it's just H (length-prefixed or raw)
  if (buffer.length > 10) {
    const potentialLength = buffer.readUInt32BE(0);
    if (potentialLength > 100 && potentialLength < 1000 && potentialLength <= buffer.length - 4) {
      const keyBytes = buffer.slice(4, 4 + potentialLength);
      const keyBigInt = BigInt('0x' + keyBytes.toString('hex'));
      return { h: keyBigInt, p: DEFAULT_ELGAMAL_PARAMS.p, g: DEFAULT_ELGAMAL_PARAMS.g };
    }
  }

  const h = BigInt('0x' + buffer.toString('hex'));
  return { h, p: DEFAULT_ELGAMAL_PARAMS.p, g: DEFAULT_ELGAMAL_PARAMS.g };
}

/**
 * Parse public key from explicit p,g,h components
 */
export function parsePublicKeyFromComponents(p, g, h) {
  const normalize = (hexStr) => {
    const hex = hexStr.startsWith('0x') ? hexStr.slice(2) : hexStr;
    return BigInt('0x' + hex);
  };
  return {
    p: normalize(p),
    g: normalize(g),
    h: normalize(h)
  };
}

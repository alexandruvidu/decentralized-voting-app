
import { 
  modPow, 
  modInverse, 
  encodeCiphertext, 
  decodeCiphertext, 
  encodeCandidateName, 
  DEFAULT_ELGAMAL_PARAMS, 
  randomBigInt 
} from './src/crypto.js';

async function testFlow() {
  console.log('Testing Encryption/Decryption Flow...');

  // 1. Setup Keys (Simulating DKG params)
  const p = DEFAULT_ELGAMAL_PARAMS.p;
  const g = DEFAULT_ELGAMAL_PARAMS.g;
  
  // Random private key
  const x = randomBigInt(1n, p - 2n);
  
  // Public key h = g^x mod p
  const h = modPow(g, x, p);
  
  console.log('Keys generated.');
  console.log('p bits:', p.toString(2).length);
  
  // 2. Encrypt "Alice"
  const candidateName = "Alice";
  const message = encodeCandidateName(candidateName);
  console.log('Candidate:', candidateName);
  console.log('Message Hash:', message.toString());
  
  const r = randomBigInt(1n, p - 2n);
  const c1 = modPow(g, r, p);
  const hr = modPow(h, r, p);
  const c2 = (hr * message) % p;
  
  const encryptedHex = encodeCiphertext(c1, c2);
  console.log('Encrypted Hex length:', encryptedHex.length);
  
  // 3. Decrypt
  const { c1: d_c1, c2: d_c2 } = decodeCiphertext(encryptedHex);
  
  // m = c2 * (c1^x)^(-1) mod p
  const c1x = modPow(d_c1, x, p);
  const c1xInv = modInverse(c1x, p);
  const decryptedM = (d_c2 * c1xInv) % p;
  
  console.log('Decrypted M:', decryptedM.toString());
  
  if (decryptedM === message) {
    console.log('SUCCESS: Decrypted message matches original hash!');
  } else {
    console.error('FAILURE: Decrypted message does NOT match!');
    console.error('Original:', message.toString());
    console.error('Decrypted:', decryptedM.toString());
  }
}

testFlow().catch(console.error);

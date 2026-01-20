# DKG Service - Distributed Key Generation with 3-of-5 Threshold

Threshold cryptography service for the decentralized voting app. Uses Shamir Secret Sharing to split an encryption private key into 5 shares where any 3 shares can reconstruct the key.

## Features

- **3-of-5 Threshold**: Private key split into 5 shares, any 3 can reconstruct
- **Shamir Secret Sharing**: Industry-standard threshold scheme
- **Key Ceremony**: Setup phase generates keys, distribute phase gives shareholders their shares
- **Share Verification**: Verify shares are valid before storing
- **Public Key Management**: Publish public key for vote encryption

## API Endpoints

### `POST /dkg/setup`
Initialize a new DKG ceremony. Generates the private key and threshold scheme.

**Request:**
```json
{
  "electionId": 1,
  "threshold": 3,
  "shares": 5,
  "shareholderIds": ["voter1", "voter2", "voter3", "voter4", "voter5"]
}
```

**Response:**
```json
{
  "success": true,
  "ceremonyId": "cer_123abc",
  "publicKey": "02a1b2c3...",
  "threshold": 3,
  "totalShares": 5,
  "status": "initialized"
}
```

### `POST /dkg/distribute-shares`
Distribute key shares to shareholders. Each shareholder gets their share encrypted.

**Request:**
```json
{
  "ceremonyId": "cer_123abc"
}
```

**Response:**
```json
{
  "success": true,
  "shares": [
    {
      "shareholderId": "voter1",
      "share": "encrypted_share_data",
      "verificationHash": "hash_for_verification"
    }
  ]
}
```

### `GET /dkg/verify-shares/:ceremonyId`
Verify all distributed shares are valid.

**Response:**
```json
{
  "success": true,
  "ceremonyId": "cer_123abc",
  "allSharesValid": true,
  "validShares": 5,
  "status": "ready_for_decryption"
}
```

### `GET /dkg/public-key/:ceremonyId`
Get the public key for an election (used to encrypt votes).

**Response:**
```json
{
  "success": true,
  "publicKey": "02a1b2c3d4e5...",
  "ceremonyId": "cer_123abc",
  "threshold": 3,
  "totalShares": 5
}
```

### `POST /dkg/threshold-decrypt`
Combine key shares from N-of-M shareholders to decrypt a ciphertext.

**Request:**
```json
{
  "ceremonyId": "cer_123abc",
  "shareholderShares": [
    {
      "shareholderId": "voter1",
      "share": "share_data"
    },
    {
      "shareholderId": "voter2",
      "share": "share_data"
    },
    {
      "shareholderId": "voter3",
      "share": "share_data"
    }
  ],
  "ciphertext": "encrypted_votes_data"
}
```

**Response:**
```json
{
  "success": true,
  "plaintext": "decrypted_vote_tally",
  "shareholdersUsed": 3
}
```

## Setup

```bash
npm install
npm start
```

Server runs on `http://localhost:3002`

## Architecture

```
DKG Ceremony Phases:

1. SETUP
   ├─ Generate random private key
   ├─ Create 5 shares using Shamir Secret Sharing (3-of-5)
   └─ Derive public key from private key

2. DISTRIBUTION
   ├─ Assign each share to a shareholder
   ├─ Create verification hashes
   └─ Store encrypted shares

3. VERIFICATION
   ├─ Verify all shares are valid using hashes
   ├─ Confirm key ceremony is ready
   └─ Publish public key to contract

4. DECRYPTION (Tally phase)
   ├─ Collect 3 (or more) shares from shareholders
   ├─ Reconstruct private key using Lagrange interpolation
   └─ Decrypt vote ciphertext with reconstructed key
```

## Security Considerations

- Private key never stored in plaintext
- Each shareholder only receives their assigned share
- Verification hashes allow detecting corrupted shares
- Threshold requirement (3-of-5) means no single shareholder can decrypt alone
- Reconstruct happens in-memory only during decryption

## Testing

```bash
# Generate keys for testing
node src/test-dkg.js

# Start service and test with curl
curl -X POST http://localhost:3002/dkg/setup \
  -H "Content-Type: application/json" \
  -d '{"electionId": 1, "threshold": 3, "shares": 5}'
```

# 🔐 Vote Relayer Service

Privacy-preserving ballot submission service that hides voter addresses from the blockchain.

## 🎯 What It Does

**Problem**: When voters submit encrypted votes directly to the blockchain, their wallet address is visible on-chain. Even though the vote content is encrypted, observers can see **who voted**.

**Solution**: The relayer acts as a privacy proxy:
1. Voters send encrypted votes to the relayer via HTTPS
2. Relayer verifies eligibility and signature
3. Relayer submits vote from its own wallet
4. Blockchain only sees: `relayer_address → voteEncrypted(encrypted_vote)`
5. **Voter's address remains hidden!**

## 🔒 Privacy Architecture

```
┌─────────────┐
│   Voter A   │  Encrypts vote locally
│  (erd1abc)  │  Signs request with private key
└──────┬──────┘
       │ HTTPS POST /relay-vote
       │ { encrypted_vote, signature, timestamp }
       ↓
┌─────────────────┐
│  Vote Relayer   │  ✓ Verify signature
│   (erd1xyz)     │  ✓ Check eligibility
│   Port 3001     │  ✓ Prevent duplicates
└──────┬──────────┘
       │ Submit from relayer's wallet
       ↓
┌─────────────────────────────┐
│   Smart Contract (Blockchain)  │
│   Transaction shows:            │
│   From: erd1xyz (relayer)      │
│   Data: voteEncrypted(...)     │
│   ❌ NO link to erd1abc!       │
└─────────────────────────────┘
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd vote-relayer
npm install
```

### 2. Generate Relayer Wallet

```bash
npm run generate-wallet
```

This creates:
- `relayer-wallet.pem` - Used by the relayer service
- `relayer-wallet.json` - Backup (contains mnemonic)

⚠️ **IMPORTANT**: Save the mnemonic in a secure location!

### 3. Fund Relayer Wallet

Copy the generated address and fund it with devnet EGLD:

```
https://devnet-wallet.multiversx.com/faucet
```

The relayer needs EGLD to pay gas fees for submitting votes.

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and verify settings:
- `CONTRACT_ADDRESS` - Your deployed voting contract
- `RELAYER_PEM_PATH` - Path to relayer-wallet.pem
- `PORT` - Relayer service port (default: 3001)

### 5. Start Relayer

```bash
npm start
```

You should see:

```
🔐 Vote Relayer Service Started
================================
📡 Server: http://localhost:3001
🌐 Network: devnet
📝 Contract: erd1qqq...
📊 Dashboard: http://localhost:3001/dashboard
================================
```

## 📊 Monitoring Dashboard

Open http://localhost:3001/dashboard to view:

- **Total Votes Relayed** - Number of votes submitted
- **Success Rate** - Percentage of successful relays
- **Relayer Balance** - Current xEGLD balance
- **Uptime** - How long the service has been running
- **Recent Activity** - Last 20 vote relay attempts

## 🔧 API Endpoints

### POST /relay-vote

Submit an encrypted vote through the relayer.

**Request:**
```json
{
  "election_id": 1,
  "encrypted_vote": "base64_encrypted_data...",
  "voter_address": "erd1abc...",
  "voter_signature": "base64_signature...",
  "timestamp": 1234567890
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Vote relayed successfully",
  "txHash": "abc123...",
  "explorerUrl": "https://devnet-explorer.multiversx.com/transactions/abc123..."
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Voter not eligible for this election"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "vote-relayer",
  "timestamp": "2026-01-15T19:00:00.000Z"
}
```

### GET /dashboard

Web interface for monitoring relayer activity.

### GET /api/stats

Get relayer statistics (JSON format).

### GET /api/activity

Get recent activity log (JSON format).

## 🛡️ Security Features

### 1. Signature Verification
- Voters must sign their requests with their private key
- Proves ownership of the address without revealing private key
- Prevents impersonation attacks

### 2. Eligibility Checking
- Relayer verifies voter is in the eligible voters list
- Queries smart contract before relaying
- Rejects votes from non-eligible addresses

### 3. Duplicate Prevention
- Tracks which addresses have voted in each election
- Prevents double-voting attempts
- Memory-based (resets on restart - production should use database)

### 4. Timestamp Validation
- Requests must include current timestamp
- Rejected if timestamp is > 5 minutes old
- Prevents replay attacks

### 5. Rate Limiting
- Maximum 5 requests per minute per IP address
- Prevents spam and DoS attacks
- Configurable via environment variables

### 6. Request Size Limits
- JSON payload limited to 10KB
- Prevents memory exhaustion attacks

## ⚙️ Configuration

All configuration via `.env` file:

```bash
# Server
PORT=3001

# Network
NETWORK=devnet
GATEWAY_URL=https://devnet-gateway.multiversx.com
API_URL=https://devnet-api.multiversx.com

# Contract
CONTRACT_ADDRESS=erd1qqq...

# Wallet
RELAYER_PEM_PATH=./relayer-wallet.pem

# Security
RATE_LIMIT_WINDOW_MS=60000        # 1 minute
RATE_LIMIT_MAX_REQUESTS=5         # 5 requests per window

# Monitoring
ENABLE_DASHBOARD=true
DASHBOARD_PASSWORD=admin123
```

## 🔍 How It Works

### Step 1: Voter Encrypts Vote (Client-Side)

```typescript
// In voter's browser
const encrypted = encryptVote(candidateIndex, electionPublicKey);
const timestamp = Date.now();
const message = `${electionId}:${encrypted}:${timestamp}`;
const signature = signMessage(message, voterPrivateKey);
```

### Step 2: Send to Relayer

```typescript
const response = await fetch('http://localhost:3001/relay-vote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    election_id: electionId,
    encrypted_vote: encrypted,
    voter_address: voterAddress,
    voter_signature: signature,
    timestamp: timestamp
  })
});
```

### Step 3: Relayer Verifies and Submits

```javascript
// Relayer service
1. Verify signature (proves voter owns address)
2. Check eligibility (query contract)
3. Check no duplicate (check local cache)
4. Build transaction: voteEncrypted(electionId, encryptedVote)
5. Sign with relayer's wallet
6. Submit to blockchain
7. Return transaction hash
```

### Step 4: Blockchain Records Vote

```
Transaction on blockchain:
From: erd1xyz... (RELAYER address)
To: erd1qqq... (contract)
Data: voteEncrypted(1, "abc123...")
Gas: paid by relayer

❌ Original voter address (erd1abc) NOT visible anywhere!
```

## 🎯 Privacy Guarantees

### What's Hidden:
✅ **Voter's wallet address** - Not visible on blockchain  
✅ **Vote content** - Encrypted (threshold crypto)  
✅ **Linking votes to voters** - Impossible from blockchain alone  

### What's Visible:
⚠️ **Relayer's address** - Submits all votes  
⚠️ **Encrypted vote data** - Blob of encrypted bytes  
⚠️ **Transaction timestamp** - When vote was submitted  

### Trust Requirements:

**Must trust relayer to:**
- ✅ Not log voter addresses
- ✅ Not correlate timing of requests with blockchain submissions
- ✅ Not share voter information

**Mitigation:**
- Run multiple relayers (voters choose randomly)
- Open-source code (anyone can audit)
- Deploy in secure enclave (provably no logging)
- Legal agreements and penalties

## 🧪 Testing

### Test the relayer locally:

```bash
# Start relayer
npm start

# In another terminal, test with curl:
curl -X POST http://localhost:3001/relay-vote \
  -H "Content-Type: application/json" \
  -d '{
    "election_id": 1,
    "encrypted_vote": "test_encrypted_data_base64",
    "voter_address": "erd1qqqqqqqqqqqqqpgqp697qy35ea5m84kpj6nmf2j3tz0qx0qav8mskn2h9z",
    "voter_signature": "test_signature_base64",
    "timestamp": '$(date +%s000)'
  }'
```

### Expected response:
```json
{
  "success": true,
  "txHash": "abc123...",
  "explorerUrl": "https://devnet-explorer.multiversx.com/transactions/abc123..."
}
```

## 🚀 Production Deployment

### 1. Security Hardening

```bash
# Use strong dashboard password
DASHBOARD_PASSWORD=your_secure_password_here

# Restrict CORS to your frontend domain
# Edit src/server.js:
origin: ['https://your-voting-app.com']

# Use HTTPS (put behind reverse proxy)
# nginx or Cloudflare
```

### 2. Database Integration

Current implementation uses in-memory storage. For production:

```javascript
// Replace memory storage with PostgreSQL/MongoDB
// Track voted addresses persistently
// Store activity logs for auditing
```

### 3. Monitoring

```bash
# Add production monitoring:
- Uptime monitoring (UptimeRobot, Pingdom)
- Error tracking (Sentry)
- Metrics (Prometheus + Grafana)
- Alerts (PagerDuty, Slack)
```

### 4. Scaling

```bash
# Run multiple relayer instances behind load balancer
# Share state via Redis for duplicate prevention
# Use message queue for high throughput
```

### 5. Wallet Management

```bash
# Rotate relayer wallet periodically
# Keep backup wallets funded
# Monitor balance and auto-refill
```

## 📁 Project Structure

```
vote-relayer/
├── src/
│   ├── server.js         # Express server + endpoints
│   ├── relayer.js        # Core relay logic
│   ├── monitor.js        # Statistics and activity tracking
│   └── generate-wallet.js # Wallet generation script
├── package.json          # Dependencies
├── .env.example          # Configuration template
├── .env                  # Your configuration (gitignored)
├── .gitignore           # Git ignore rules
├── relayer-wallet.pem   # Relayer wallet (gitignored)
└── README.md            # This file
```

## 🤝 Integration with Frontend

See `voting-frontend/helpers/relayer.ts` for client integration example.

The frontend will automatically use the relayer when available, with fallback to direct submission.

## 📞 Support

For issues or questions:
1. Check dashboard at http://localhost:3001/dashboard
2. Check logs for error messages
3. Verify relayer wallet has sufficient EGLD balance
4. Ensure contract address is correct in .env

## 📜 License

MIT

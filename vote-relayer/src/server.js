import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { relayVote } from './relayer.js';
import { getStats, getRecentActivity } from './monitor.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));

// Rate limiting - per IP address
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5, // 5 requests per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'vote-relayer',
    timestamp: new Date().toISOString()
  });
});

// Main relayer endpoint
app.post('/relay-vote', limiter, async (req, res) => {
  try {
    const { 
      election_id, 
      encrypted_vote, 
      voter_address,
      voter_signature,
      timestamp 
    } = req.body;

    // Validate required fields
    if (!election_id || !encrypted_vote || !voter_address || !voter_signature) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['election_id', 'encrypted_vote', 'voter_address', 'voter_signature']
      });
    }

    // Validate timestamp (prevent replay attacks - must be within 5 minutes)
    const now = Date.now();
    if (!timestamp || Math.abs(now - timestamp) > 5 * 60 * 1000) {
      return res.status(400).json({ 
        error: 'Invalid or expired timestamp',
        hint: 'Request must be made within 5 minutes'
      });
    }

    console.log(`📨 Received vote relay request for election ${election_id}`);
    console.log(`   Voter: ${voter_address.slice(0, 10)}...${voter_address.slice(-8)}`);

    // Relay the vote
    const result = await relayVote({
      election_id,
      encrypted_vote,
      voter_address,
      voter_signature,
      timestamp
    });

    if (result.success) {
      console.log(`✅ Vote relayed successfully: ${result.txHash}`);
      res.json({
        success: true,
        message: 'Vote relayed successfully',
        txHash: result.txHash,
        explorerUrl: `https://devnet-explorer.multiversx.com/transactions/${result.txHash}`
      });
    } else {
      console.error(`❌ Vote relay failed: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Relay endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Monitoring dashboard
if (process.env.ENABLE_DASHBOARD === 'true') {
  app.get('/dashboard', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vote Relayer Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
          }
          .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
          .header p { opacity: 0.9; }
          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          .stat-card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .stat-label {
            font-size: 0.875rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #333;
          }
          .stat-unit {
            font-size: 0.875rem;
            color: #999;
            margin-left: 5px;
          }
          .activity {
            background: white;
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .activity h2 {
            margin-bottom: 20px;
            color: #333;
          }
          .activity-list {
            max-height: 400px;
            overflow-y: auto;
          }
          .activity-item {
            padding: 15px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .activity-item:last-child { border-bottom: none; }
          .activity-status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
          }
          .status-success { background: #d4edda; color: #155724; }
          .status-error { background: #f8d7da; color: #721c24; }
          .refresh-btn {
            background: white;
            color: #667eea;
            border: 2px solid white;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            margin-top: 20px;
            display: block;
            margin-left: auto;
            margin-right: auto;
          }
          .refresh-btn:hover {
            background: #667eea;
            color: white;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Vote Relayer Dashboard</h1>
            <p>Privacy-preserving ballot submission service</p>
          </div>
          
          <div class="stats" id="stats">
            <div class="stat-card">
              <div class="stat-label">Total Votes Relayed</div>
              <div class="stat-value">
                <span id="totalVotes">0</span>
                <span class="stat-unit">votes</span>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Success Rate</div>
              <div class="stat-value">
                <span id="successRate">100</span>
                <span class="stat-unit">%</span>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Relayer Balance</div>
              <div class="stat-value">
                <span id="balance">-</span>
                <span class="stat-unit">xEGLD</span>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Uptime</div>
              <div class="stat-value">
                <span id="uptime">-</span>
              </div>
            </div>
          </div>

          <div class="activity">
            <h2>Recent Activity</h2>
            <div class="activity-list" id="activityList">
              <div class="activity-item">
                <span>No activity yet</span>
              </div>
            </div>
          </div>

          <button class="refresh-btn" onclick="loadData()">↻ Refresh Data</button>
        </div>

        <script>
          async function loadData() {
            try {
              const [stats, activity] = await Promise.all([
                fetch('/api/stats').then(r => r.json()),
                fetch('/api/activity').then(r => r.json())
              ]);

              document.getElementById('totalVotes').textContent = stats.totalVotes || 0;
              document.getElementById('successRate').textContent = stats.successRate || 100;
              document.getElementById('balance').textContent = stats.balance || '-';
              document.getElementById('uptime').textContent = stats.uptime || '-';

              const activityList = document.getElementById('activityList');
              if (activity.length === 0) {
                activityList.innerHTML = '<div class="activity-item"><span>No activity yet</span></div>';
              } else {
                activityList.innerHTML = activity.map(item => \`
                  <div class="activity-item">
                    <div>
                      <strong>Election \${item.election_id}</strong>
                      <br>
                      <small style="color: #666">\${new Date(item.timestamp).toLocaleString()}</small>
                    </div>
                    <span class="activity-status status-\${item.status}">
                      \${item.status === 'success' ? '✓ Relayed' : '✗ Failed'}
                    </span>
                  </div>
                \`).join('');
              }
            } catch (error) {
              console.error('Failed to load dashboard data:', error);
            }
          }

          loadData();
          setInterval(loadData, 10000); // Refresh every 10 seconds
        </script>
      </body>
      </html>
    `);
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/activity', async (req, res) => {
    try {
      const activity = await getRecentActivity();
      res.json(activity);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🔐 Vote Relayer Service Started');
  console.log('================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🌐 Network: ${process.env.NETWORK || 'devnet'}`);
  console.log(`📝 Contract: ${process.env.CONTRACT_ADDRESS?.slice(0, 20)}...`);
  if (process.env.ENABLE_DASHBOARD === 'true') {
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  }
  console.log('================================');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});

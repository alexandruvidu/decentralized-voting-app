import { readFileSync } from 'fs';
import { Address } from '@multiversx/sdk-core';
import { ApiNetworkProvider } from '@multiversx/sdk-network-providers';
import { UserWallet } from '@multiversx/sdk-wallet';
import dotenv from 'dotenv';

dotenv.config();

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://devnet-gateway.multiversx.com';
const PEM_PATH = process.env.RELAYER_PEM_PATH || './relayer-wallet.pem';

// In-memory activity log (in production, use database)
const activityLog = [];
const MAX_LOG_SIZE = 100;

// Stats tracking
let stats = {
  totalVotes: 0,
  successfulVotes: 0,
  failedVotes: 0,
  startTime: Date.now()
};

// Initialize provider
const provider = new ApiNetworkProvider(GATEWAY_URL, { timeout: 10000 });

/**
 * Log activity
 */
export async function logActivity(activity) {
  activityLog.unshift(activity);
  
  // Keep only recent activities
  if (activityLog.length > MAX_LOG_SIZE) {
    activityLog.pop();
  }

  // Update stats
  stats.totalVotes++;
  if (activity.status === 'success') {
    stats.successfulVotes++;
  } else {
    stats.failedVotes++;
  }
}

/**
 * Get recent activity
 */
export async function getRecentActivity() {
  return activityLog.slice(0, 20); // Return last 20 activities
}

/**
 * Get relayer statistics
 */
export async function getStats() {
  try {
    // Get relayer balance
    let balance = '-';
    try {
      const pemContent = readFileSync(PEM_PATH, 'utf8');
      const wallet = UserWallet.fromPem(pemContent);
      const address = wallet.generatePublicKey().toAddress();
      const account = await provider.getAccount(address);
      balance = (Number(account.balance) / 1e18).toFixed(4);
    } catch (error) {
      console.error('Failed to get balance:', error.message);
    }

    // Calculate uptime
    const uptimeMs = Date.now() - stats.startTime;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const uptime = `${uptimeHours}h ${uptimeMinutes}m`;

    // Calculate success rate
    const successRate = stats.totalVotes > 0 
      ? Math.round((stats.successfulVotes / stats.totalVotes) * 100)
      : 100;

    return {
      totalVotes: stats.totalVotes,
      successfulVotes: stats.successfulVotes,
      failedVotes: stats.failedVotes,
      successRate,
      balance,
      uptime
    };
  } catch (error) {
    console.error('Failed to get stats:', error);
    return {
      totalVotes: stats.totalVotes,
      successfulVotes: stats.successfulVotes,
      failedVotes: stats.failedVotes,
      successRate: 0,
      balance: '-',
      uptime: '-'
    };
  }
}

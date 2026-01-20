/**
 * Relayer client for privacy-preserving vote submission
 * Hides voter addresses from blockchain by using a relayer proxy
 */

const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';

export interface RelayVoteRequest {
  election_id: number;
  encrypted_vote: string;
  voter_address: string;
  voter_signature: string;
  timestamp: number;
}

export interface RelayVoteResponse {
  success: boolean;
  message?: string;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

/**
 * Check if relayer service is available
 */
export async function isRelayerAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${RELAYER_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });
    
    const data = await response.json();
    return response.ok && data.status === 'healthy';
  } catch (error) {
    console.warn('Relayer unavailable:', error);
    return false;
  }
}

/**
 * Sign message for relayer verification
 * In production, use proper MultiversX wallet signing
 */
function signMessage(message: string, address: string): string {
  // For now, return a placeholder signature
  // In production, integrate with MultiversX wallet to sign the message
  // Example with @multiversx/sdk-wallet:
  // const signer = new UserSigner(...);
  // const signature = await signer.sign(Buffer.from(message));
  // return signature.toString('base64');
  
  return Buffer.from(`signature_${address}_${message}`).toString('base64');
}

/**
 * Submit encrypted vote through relayer
 * This hides the voter's address from the blockchain
 */
export async function relayVote(
  params: RelayVoteRequest | { election_id: number; encrypted_vote: string; voter_address: string; voter_signature?: string; timestamp?: number }
): Promise<RelayVoteResponse> {
  try {
    // Normalize input - accept both object formats
    const electionId = params.election_id;
    const encryptedVote = params.encrypted_vote;
    const voterAddress = params.voter_address;
    // Ensure timestamp is in milliseconds
    let timestamp = params.timestamp || Date.now();
    if (timestamp < 10000000000) {
      // If timestamp is in seconds (< year 2286 in seconds), convert to milliseconds
      timestamp = timestamp * 1000;
    }
    
    // Create signature if not provided
    let signature = params.voter_signature;
    if (!signature || signature === 'placeholder') {
      const message = `${electionId}:${encryptedVote}:${timestamp}`;
      signature = signMessage(message, voterAddress);
    }

    const request: RelayVoteRequest = {
      election_id: electionId,
      encrypted_vote: encryptedVote,
      voter_address: voterAddress,
      voter_signature: signature,
      timestamp
    };

    console.log('📡 Submitting vote via relayer...');
    console.log('Request payload:', request);
    
    const response = await fetch(`${RELAYER_URL}/relay-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    const data: RelayVoteResponse = await response.json();

    if (response.ok && data.success) {
      console.log('✅ Vote relayed successfully');
      console.log(`   Transaction: ${data.txHash}`);
      return data;
    } else {
      console.error('❌ Relayer rejected vote:', data.error);
      return {
        success: false,
        error: data.error || 'Relayer rejected the vote'
      };
    }

  } catch (error) {
    console.error('❌ Relayer error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to contact relayer'
    };
  }
}

/**
 * Submit vote with automatic relayer fallback
 * Tries relayer first, falls back to direct submission if unavailable
 */
export async function submitVoteWithFallback(
  electionId: number,
  encryptedVote: string,
  voterAddress: string,
  directSubmitFn: () => Promise<string>
): Promise<{ success: boolean; txHash?: string; error?: string; method: 'relayer' | 'direct' }> {
  
  // Check if relayer is available
  const relayerAvailable = await isRelayerAvailable();
  
  if (relayerAvailable) {
    console.log('🔐 Using relayer for privacy');
    const result = await relayVote({
      election_id: electionId,
      encrypted_vote: encryptedVote,
      voter_address: voterAddress
    });
    
    if (result.success) {
      return {
        success: true,
        txHash: result.txHash,
        method: 'relayer'
      };
    } else {
      console.warn('⚠️  Relayer failed, falling back to direct submission');
    }
  } else {
    console.warn('⚠️  Relayer unavailable, using direct submission');
  }

  // Fallback to direct submission
  try {
    console.log('📤 Submitting vote directly to blockchain...');
    const txHash = await directSubmitFn();
    return {
      success: true,
      txHash,
      method: 'direct'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit vote',
      method: 'direct'
    };
  }
}

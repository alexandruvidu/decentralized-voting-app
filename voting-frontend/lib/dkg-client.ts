/**
 * DKG Service Client for Frontend
 * Fetches election public keys and manages homomorphic encryption
 */

export interface ElGamalPublicKey {
  p: string;
  g: string;
  h: string;
}

const DKG_SERVICE_URL = process.env.NEXT_PUBLIC_DKG_URL || '/dkg-api';

export interface DKGCeremony {
  ceremonyId: string;
  electionId: string;
  publicKey: ElGamalPublicKey;
  threshold: number;
  totalShares: number;
  status: string;
}

export interface DKGPublicKeyResponse {
  success: boolean;
  publicKey: ElGamalPublicKey;
  ceremonyId: string;
  error?: string;
}

/**
 * Check if DKG service is available
 */
export async function isDKGServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${DKG_SERVICE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });
    
    const data = await response.json();
    return response.ok && data.status === 'healthy';
  } catch (error) {
    console.warn('DKG service unavailable:', error);
    return false;
  }
}

/**
 * Get election public key from DKG service
 * This key is used to encrypt votes
 * 
 * @param electionId - The election ID
 * @returns ElGamal public key {p, g, h}
 */
export async function getElectionPublicKey(
  electionId: string | number
): Promise<ElGamalPublicKey> {
  try {
    const response = await fetch(`${DKG_SERVICE_URL}/dkg/public-key/${electionId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch public key: ${response.statusText}`);
    }
    
    const data: DKGPublicKeyResponse = await response.json();
    
    if (!data.success || !data.publicKey) {
      throw new Error(data.error || 'Invalid response from DKG service');
    }
    
    return data.publicKey;
  } catch (error) {
    console.error('Error fetching election public key:', error);
    throw error;
  }
}

/**
 * Get ceremony details
 * 
 * @param ceremonyId - The ceremony/election ID
 * @returns Full ceremony details
 */
export async function getCeremony(ceremonyId: string): Promise<DKGCeremony> {
  try {
    const response = await fetch(`${DKG_SERVICE_URL}/dkg/ceremony/${ceremonyId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ceremony: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to get ceremony');
    }
    
    return data.ceremony;
  } catch (error) {
    console.error('Error fetching ceremony:', error);
    throw error;
  }
}

/**
 * Create a new DKG ceremony for an election
 * This should be called when creating an election
 * 
 * @param electionId - The election ID
 * @param threshold - Minimum shares needed for decryption (default: 3)
 * @param totalShares - Total number of shares (default: 5)
 * @returns Ceremony details including public key
 */
export async function setupElectionCeremony(
  electionId: string | number,
  threshold: number = 3,
  totalShares: number = 5
): Promise<DKGCeremony> {
  try {
    const response = await fetch(`${DKG_SERVICE_URL}/dkg/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        electionId,
        threshold,
        shares: totalShares
      }),
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to setup ceremony: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to setup ceremony');
    }
    
    return {
      ceremonyId: data.ceremonyId,
      electionId: electionId.toString(),
      publicKey: {
        p: data.publicKey.p || data.publicKey,
        g: data.publicKey.g || '2',
        h: data.publicKey.h || data.publicKey
      } as ElGamalPublicKey,
      threshold: data.threshold,
      totalShares: data.totalShares,
      status: data.status
    };
  } catch (error) {
    console.error('Error setting up ceremony:', error);
    throw error;
  }
}

/**
 * List all ceremonies
 */
export async function listCeremonies(): Promise<DKGCeremony[]> {
  try {
    const response = await fetch(`${DKG_SERVICE_URL}/dkg/ceremonies`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list ceremonies: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to list ceremonies');
    }
    
    return data.ceremonies;
  } catch (error) {
    console.error('Error listing ceremonies:', error);
    throw error;
  }
}

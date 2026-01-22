'use client';

import { useEffect, useState } from 'react';
import { Buffer } from 'buffer';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';
import { contractAddress } from '@/config';
import votingAppAbi from '@/contracts/voting-app.abi.json';

interface Election {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  isFinalized: boolean;
}

interface DKGCeremony {
  ceremonyId: string;
  electionId: number;
  publicKey?: { p: string; g: string; h: string };
  status: string;
}

const DKG_SERVICE_URL = '/dkg-api';

// Provide Buffer in browser for downstream libs (window + globalThis)
if (typeof window !== 'undefined' && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}
if (typeof globalThis !== 'undefined' && !(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }

  throw new Error('Base64 decode not supported in this environment');
}

export default function DKGPage() {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [elections, setElections] = useState<Election[]>([]);
  const [ceremonies, setCeremonies] = useState<DKGCeremony[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [currentContract, setCurrentContract] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<any>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      // Don't set loading on background refreshes
      loadDataSilent();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    setLoading(true);
    await Promise.all([
      fetchElections(), 
      fetchCeremonies(),
      fetchContractAddress(),
      fetchStorageStats()
    ]);
    setLoading(false);
  }

  async function loadDataSilent() {
    await Promise.all([
      fetchElections(), 
      fetchCeremonies(),
      fetchContractAddress(),
      fetchStorageStats()
    ]);
  }

  async function fetchElections() {
    try {
      const response = await fetch('https://devnet-gateway.multiversx.com/vm-values/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scAddress: contractAddress,
          funcName: 'getAllElections',
          args: []
        })
      });

      const data = await response.json();

      if (!data.data?.data?.returnData) {
        setElections([]);
        return;
      }

      const parsedElections: Election[] = [];

      for (const electionData of data.data.data.returnData) {
        try {
          const bytes = base64ToBytes(electionData);
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          let offset = 0;

          const id = Number(view.getBigUint64(offset));
          offset += 8;

          const nameLength = view.getUint32(offset);
          offset += 4;

          const nameBytes = bytes.slice(offset, offset + nameLength);
          const name = new TextDecoder().decode(nameBytes);
          offset += nameLength;

          const startTime = Number(view.getBigUint64(offset));
          offset += 8;

          const endTime = Number(view.getBigUint64(offset));
          offset += 8;

          const isFinalized = view.getUint8(offset) === 1;

          parsedElections.push({ id, name, startTime, endTime, isFinalized });
        } catch (e) {
          console.error('Error parsing election:', e);
        }
      }

      setElections(parsedElections);
    } catch (error) {
      console.error('Error fetching elections:', error);
    }
  }

  async function fetchCeremonies() {
    try {
      const response = await fetch(`${DKG_SERVICE_URL}/dkg/ceremonies`);
      const data = await response.json();
      setCeremonies(data.ceremonies || []);
    } catch (error) {
      console.error('Error fetching ceremonies:', error);
    }
  }

  async function fetchContractAddress() {
    try {
      const response = await fetch(`${DKG_SERVICE_URL}/contract/current`);
      const data = await response.json();
      if (data.success && data.contractAddress) {
        setCurrentContract(data.contractAddress);
      }
    } catch (error) {
      console.error('Error fetching contract address:', error);
    }
  }

  async function fetchStorageStats() {
    try {
      const response = await fetch(`${DKG_SERVICE_URL}/storage/stats`);
      const data = await response.json();
      if (data.success) {
        setStorageStats(data);
      }
    } catch (error) {
      console.error('Error fetching storage stats:', error);
    }
  }

  async function generateKeys(electionId: number, electionName: string) {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }

    setGeneratingFor(electionId);

    try {
      const response = await fetch(`${DKG_SERVICE_URL}/dkg/public-key/${electionId}?autocreate=true`);
      const data = await response.json();

      if (!data.success || !data.publicKey) {
        throw new Error(data.error || 'Failed to generate keys');
      }

      // Redirect to the store-key page so the user signs the on-chain transaction with their wallet
      const params = new URLSearchParams({
        electionId: electionId.toString(),
        publicKey: data.publicKey.h // DKG service returns { p, g, h }; the contract only needs h
      });

      window.location.href = `/store-key?${params.toString()}`;
      return;
    } catch (error) {
      console.error('Error generating keys:', error);
      alert(`Failed to generate keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGeneratingFor(null);
    }
  }

  function getCeremonyForElection(electionId: number): DKGCeremony | undefined {
    return ceremonies.find((c) => c.electionId === electionId);
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading elections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">DKG Key Management</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Generate and store threshold encryption keys for elections
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
        >
          {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {!address && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 dark:text-yellow-200">
            ⚠️ Please connect your wallet to generate encryption keys
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold">Elections</h2>
        </div>

        {elections.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No elections found
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {elections.map((election) => {
              const ceremony = getCeremonyForElection(election.id);
              const hasKeys = ceremony && ceremony.publicKey;

              return (
                <div key={election.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{election.name}</h3>
                      <div className="flex gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <span>ID: {election.id}</span>
                        <span>
                          {new Date(election.startTime * 1000).toLocaleDateString()} - {new Date(election.endTime * 1000).toLocaleDateString()}
                        </span>
                        {election.isFinalized && (
                          <span className="text-green-600 dark:text-green-400">✓ Finalized</span>
                        )}
                      </div>
                      {hasKeys && (
                        <div className="mt-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            🔐 Keys Generated
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="ml-4">
                      {hasKeys ? (
                        <button
                          disabled
                          className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded cursor-not-allowed"
                        >
                          Keys Already Generated
                        </button>
                      ) : (
                        <button
                          onClick={() => generateKeys(election.id, election.name)}
                          disabled={!address || generatingFor === election.id}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition"
                        >
                          {generatingFor === election.id ? (
                            <span className="flex items-center gap-2">
                              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                              Generating...
                            </span>
                          ) : (
                            'Generate Keys'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Storage Information */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold">Storage Information</h2>
        </div>
        <div className="p-4 space-y-4">
          {currentContract && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Contract</h3>
              <code className="block px-3 py-2 bg-gray-100 dark:bg-gray-900 rounded text-sm font-mono break-all">
                {currentContract}
              </code>
            </div>
          )}
          
          {storageStats && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Stored Ceremonies: {ceremonies.length}
              </h3>
              {ceremonies.length > 0 && (
                <div className="space-y-2">
                  {ceremonies.map((ceremony) => (
                    <div key={ceremony.ceremonyId} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                      <div>
                        <span className="text-sm font-medium">Election {ceremony.electionId}</span>
                        <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">
                          {ceremony.ceremonyId}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        ceremony.status === 'verified' || ceremony.status === 'finalized'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : ceremony.status === 'distributed'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}>
                        {ceremony.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {storageStats && storageStats.totalContracts > 1 && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Other Contracts ({storageStats.totalContracts - 1})
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Data for previous contract deployments is preserved but inactive
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


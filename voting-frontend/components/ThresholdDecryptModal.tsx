'use client';

import { useState, useEffect } from 'react';
import { 
  AbiRegistry, 
  Address, 
  SmartContractTransactionsFactory, 
  TransactionsFactoryConfig,
  U64Value,
  BytesValue,
  VariadicValue,
  Tuple,
  Transaction,
  ArgSerializer
} from '@multiversx/sdk-core';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { contractAddress } from '@/config';
import votingAppAbi from '@/contracts/voting-app.abi.json';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';

interface ThresholdDecryptModalProps {
  electionId: number;
  candidates: string[];
  onClose: () => void;
  onSuccess: () => void;
}

interface KeyShard {
  index: number;
  value: string; // hex string
  shareholderId?: string; // Optional: shareholder identifier from DKG
}

type Step = 'input' | 'combine' | 'decrypt' | 'review' | 'publish' | 'success';

const CRYPTO_SERVICE_URL = process.env.NEXT_PUBLIC_CRYPTO_SERVICE_URL
  || process.env.NEXT_PUBLIC_DECRYPTION_SERVICE_URL
  || '/crypto-api';
const DKG_SERVICE_URL = process.env.NEXT_PUBLIC_DKG_URL || '/dkg-api';

export function ThresholdDecryptModal({
  electionId,
  candidates,
  onClose,
  onSuccess
}: ThresholdDecryptModalProps) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();

  const [step, setStep] = useState<Step>('input');
  const [keyShards, setKeyShards] = useState<KeyShard[]>([
    { index: 1, value: '' },
    { index: 2, value: '' }
  ]);
  const [threshold, setThreshold] = useState(2); // k-of-n
  const [combinedPrivateKey, setCombinedPrivateKey] = useState('');
  const [prime, setPrime] = useState<string | undefined>(undefined);
  const [publicKey, setPublicKey] = useState<any>(null);
  const [decryptionResults, setDecryptionResults] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Auto-fetch key shards from DKG service on mount
  useEffect(() => {
    const fetchShards = async () => {
      try {
        console.log(`Fetching key shards for election ${electionId} from DKG service...`);
        const response = await fetch(`${DKG_SERVICE_URL}/dkg/shards/${electionId}`);
        
        if (!response.ok) {
          console.warn('Could not auto-fetch shards from DKG service:', response.status);
          return;
        }

        const data = await response.json();
        if (data.success && data.shards && data.shards.length > 0) {
          console.log(`✅ Fetched ${data.shards.length} key shards from DKG service`);
          
          // Populate shards with fetched data
          const populatedShards = data.shards.slice(0, data.threshold).map((shard: any, idx: number) => ({
            index: shard.shareIndex || idx + 1,
            value: shard.share,
            shareholderId: shard.shareholderId
          }));
          
          setKeyShards(populatedShards);
          setThreshold(data.threshold);
          if (data.prime) setPrime(data.prime);
          if (data.publicKey) setPublicKey(data.publicKey);
          
          // Auto-combine if all threshold shards are available
          console.log(`🔑 Auto-combining ${data.threshold} shards...`);
          await combineAndDecrypt(populatedShards, data.threshold, data.prime, data.publicKey);
        }
      } catch (err) {
        console.warn('Warning: Could not auto-fetch shards from DKG service:', err);
        // Fall back to manual input - don't show error, just continue
      }
    };

    fetchShards();
  }, [electionId]);

  // Add another key shard input
  const addKeyShard = () => {
    const newIndex = Math.max(...keyShards.map(k => k.index), 0) + 1;
    setKeyShards([...keyShards, { index: newIndex, value: '' }]);
  };

  // Remove a key shard
  const removeKeyShard = (index: number) => {
    if (keyShards.length > threshold) {
      setKeyShards(keyShards.filter((_, i) => i !== index));
    }
  };

  // Update shard value
  const updateShard = (index: number, value: string) => {
    const updated = [...keyShards];
    updated[index].value = value;
    setKeyShards(updated);
  };

  // Combine key shards and perform decryption
  const combineAndDecrypt = async (shardsToCombine: KeyShard[], k: number, primeVal?: string, publicKeyVal?: any) => {
    // Filter out empty shards
    const filledShards = shardsToCombine.filter(s => s.value.trim() !== '');
    
    if (filledShards.length < k) {
      setError(`Need at least ${k} key shards to combine (have ${filledShards.length})`);
      return;
    }

    // Validate hex format
    const validShards = filledShards.every(s => /^0x[0-9a-fA-F]+$/.test(s.value));
    if (!validShards) {
      setError('All key shards must be in hex format (0x...)');
      return;
    }

    setIsLoading(true);

    try {
      // Call decryption service to combine shards
      const combineResponse = await fetch(`${CRYPTO_SERVICE_URL}/api/threshold/combine-shards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          electionId: electionId.toString(),
          shards: filledShards.slice(0, k).map((s, i) => ({
            index: i + 1,
            value: s.value
          })),
          threshold: k,
          prime: primeVal || prime
        })
      });      if (!combineResponse.ok) {
        const errorData = await combineResponse.json();
        throw new Error(errorData.error || 'Failed to combine shards');
      }

      const combineData = await combineResponse.json();
      const reconstructedPrivateKey = combineData.privateKey;
      setCombinedPrivateKey(reconstructedPrivateKey);
      console.log('✅ Shards combined successfully');

      // Helper to format public key for decryption service
      const formatPublicKey = (pk: any) => {
        if (!pk) return null;
        
        let formattedG;
        try {
            // Handle g if it's decimal string "2" or similar
           formattedG = pk.g.startsWith('0x') ? pk.g : `0x${BigInt(pk.g).toString(16)}`;
        } catch (e) {
           // Fallback if BigInt fails (e.g. if it was hex without 0x, though unlikely from DKG)
           formattedG = pk.g.startsWith('0x') ? pk.g : `0x${pk.g}`; 
        }

        return {
          p: pk.p.startsWith('0x') ? pk.p : `0x${pk.p}`,
          g: formattedG,
          h: pk.h.startsWith('0x') ? pk.h : `0x${pk.h}`
        };
      };

      const formattedPublicKey = formatPublicKey(publicKeyVal || publicKey);

      // Store the reconstructed private key on the backend
      console.log('💾 Storing reconstructed key...');
      const storeKeyResponse = await fetch(`${CRYPTO_SERVICE_URL}/api/dkg/store-private-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          electionId: electionId.toString(),
          privateKey: reconstructedPrivateKey,
          publicKey: formattedPublicKey
        })
      });

      if (!storeKeyResponse.ok) {
        const errorData = await storeKeyResponse.json();
        throw new Error('Failed to store reconstructed key: ' + (errorData.error || 'Unknown error'));
      }

      console.log('✅ Key stored successfully');

      // Now decrypt votes
      console.log('🔓 Decrypting votes...');
      
      // Fetch encrypted votes
      const votesResponse = await fetch(`${CRYPTO_SERVICE_URL}/api/contract/votes/${electionId}`);
      if (!votesResponse.ok) {
        throw new Error('Failed to fetch encrypted votes');
      }

      const votesData = await votesResponse.json();
      const encryptedVotes = votesData.votes;

      if (encryptedVotes.length === 0) {
        throw new Error('No encrypted votes found');
      }

      // Decrypt all votes
      const decryptResponse = await fetch(`${CRYPTO_SERVICE_URL}/api/decrypt/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          electionId: electionId.toString(),
          encryptedVotes,
          candidates
        })
      });

      if (!decryptResponse.ok) {
        const errorData = await decryptResponse.json();
        throw new Error(errorData.error || 'Failed to decrypt votes');
      }

      const decryptData = await decryptResponse.json();
      setDecryptionResults(decryptData.results);
      console.log('✅ Votes decrypted successfully');
      setStep('review');
      setIsLoading(false);
    } catch (err) {
      console.error('Error in combine and decrypt:', err);
      setError(`Decryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
      setStep('input');
    }
  };

  // Combine key shards using Lagrange interpolation (threshold crypto)
  const combineShards = async () => {
    await combineAndDecrypt(keyShards, threshold, prime, publicKey);
  };

  // Publish results to blockchain
  const handlePublish = async () => {
    if (!decryptionResults) return;

    setIsLoading(true);
    setStep('publish');
    setError('');

    try {
      // Manual transaction creation to bypass SDK factory strict type validation for variadic multi-args
      // The contract expects variadic<multi<bytes, u64>>, which means a flattened list of [bytes, u64, bytes, u64...]
      
      const args: any[] = [new U64Value(BigInt(electionId))];
      
      candidates.forEach(candidate => {
        args.push(BytesValue.fromUTF8(candidate));
        args.push(new U64Value(BigInt(decryptionResults[candidate] || 0)));
      });

      const serializer = new ArgSerializer();
      const payloadString = serializer.valuesToStrings(args).join('@');
      const dataString = `publishResults@${payloadString}`;

      const transaction = new Transaction({
        data: new TextEncoder().encode(dataString),
        gasLimit: 10_000_000n,
        receiver: new Address(contractAddress),
        sender: new Address(address),
        chainID: network.chainId,
        value: 0n
      });

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Publishing election results...',
          errorMessage: 'Error publishing results',
          successMessage: 'Results published successfully!'
        }
      });

      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error publishing results:', err);
      setError(`Failed to publish results: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
      setStep('review');
    }
  };

  const totalVotes = decryptionResults 
    ? Object.values(decryptionResults).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">🔐 Threshold Decrypt & Publish</h2>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          {/* Step 1: Enter Key Shards */}
          {step === 'input' && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>🔑 Threshold Decryption</strong><br />
                  Enter at least {threshold} key shards to reconstruct the private key and decrypt votes.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Threshold (k-of-n): {threshold} of {keyShards.length}
                </label>
                <input
                  type="range"
                  min="2"
                  max={keyShards.length}
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Need {threshold} out of {keyShards.length} shards to decrypt
                </p>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto">
                {keyShards.map((shard, idx) => (
                  <div key={idx} className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold mb-1">
                        Shard {shard.index}
                      </label>
                      <input
                        type="password"
                        value={shard.value}
                        onChange={(e) => updateShard(idx, e.target.value)}
                        placeholder="0x1234..."
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                      />
                    </div>
                    {keyShards.length > threshold && (
                      <button
                        onClick={() => removeKeyShard(idx)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded mt-6"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addKeyShard}
                className="w-full px-3 py-2 border border-dashed rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-semibold"
              >
                + Add Another Shard
              </button>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={combineShards}
                  disabled={keyShards.filter(s => s.value.trim()).length < threshold || isLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
                >
                  {isLoading ? 'Combining...' : '🔑 Combine & Decrypt'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Decrypting */}
          {step === 'decrypt' && (
            <div className="space-y-6 text-center py-8">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
              <p className="text-lg font-semibold">Decrypting votes...</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Combining shards and decrypting all ballots
              </p>
            </div>
          )}

          {/* Step 3: Review Results */}
          {step === 'review' && decryptionResults && (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  <strong>✅ Decryption successful!</strong><br />
                  {totalVotes} votes decrypted and tallied
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Election Results</h3>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left">Candidate</th>
                        <th className="px-4 py-2 text-right">Votes</th>
                        <th className="px-4 py-2 text-right">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(decryptionResults)
                        .sort(([, a], [, b]) => b - a)
                        .map(([candidate, votes]) => (
                          <tr key={candidate} className="border-b last:border-b-0">
                            <td className="px-4 py-3">{candidate}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">{votes}</td>
                            <td className="px-4 py-3 text-right">
                              {totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0}%
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>⚠️ Verify all counts before publishing.</strong> Once published, results are immutable.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePublish}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                >
                  📢 Publish Results
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Publishing */}
          {step === 'publish' && (
            <div className="space-y-6 text-center py-8">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
              </div>
              <p className="text-lg font-semibold">Publishing results to blockchain...</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Please sign the transaction in your wallet
              </p>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 'success' && (
            <div className="space-y-6 text-center py-8">
              <div className="text-5xl">🎉</div>
              <p className="text-xl font-bold">Results Published!</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                The election results have been stored on the blockchain and are now publicly viewable.
              </p>
              <button
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
              >
                Done
              </button>
            </div>
          )}

          {/* Error Display */}
          {error && step !== 'input' && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

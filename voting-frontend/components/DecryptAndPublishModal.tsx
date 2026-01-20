'use client';

import { useState, useEffect } from 'react';
import { 
  AbiRegistry,
  Address,
  SmartContractTransactionsFactory,
  TransactionsFactoryConfig,
  U64Value
} from '@multiversx/sdk-core';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { contractAddress } from '@/config';
import votingAppAbi from '@/contracts/voting-app.abi.json';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';

interface DecryptAndPublishModalProps {
  electionId: number;
  candidates: string[]; // List of candidate names
  onClose: () => void;
  onSuccess: () => void;
}

interface DecryptionResult {
  [candidate: string]: number;
}

type Step = 'fetch' | 'decrypt' | 'review' | 'publish' | 'success';

const DECRYPTION_SERVICE_URL = process.env.NEXT_PUBLIC_DECRYPTION_SERVICE_URL || '/crypto-api';

export function DecryptAndPublishModal({ 
  electionId, 
  candidates,
  onClose, 
  onSuccess 
}: DecryptAndPublishModalProps) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  
  const [step, setStep] = useState<Step>('fetch');
  const [privateKey, setPrivateKey] = useState('');
  const [publicKeyP, setPublicKeyP] = useState('');
  const [publicKeyG, setPublicKeyG] = useState('');
  const [publicKeyH, setPublicKeyH] = useState('');
  const [encryptedVotes, setEncryptedVotes] = useState<string[]>([]);
  const [decryptionResults, setDecryptionResults] = useState<DecryptionResult | null>(null);
  const [totalVotes, setTotalVotes] = useState(0);
  const [invalidVotes, setInvalidVotes] = useState(0);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch encrypted votes from contract
  const fetchEncryptedVotes = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${DECRYPTION_SERVICE_URL}/api/contract/votes/${electionId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch encrypted votes');
      }

      const data = await response.json();
      setEncryptedVotes(data.votes || []);
      
      if (data.votes.length === 0) {
        setError('No encrypted votes found for this election');
        setIsLoading(false);
        return;
      }

      setStep('decrypt');
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching votes:', err);
      setError(`Failed to fetch votes: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  // Start fetching when modal opens
  useEffect(() => {
    if (step === 'fetch') {
      fetchEncryptedVotes();
    }
  }, [step]);

  // Store private key and decrypt votes
  const handleDecrypt = async () => {
    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }

    // Validate hex format
    if (!privateKey.startsWith('0x') || !/^0x[0-9a-fA-F]+$/.test(privateKey)) {
      setError('Private key must be in hex format (0x...)');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Step 1: Store private key in decryption service
      const storeKeyResponse = await fetch(`${DECRYPTION_SERVICE_URL}/api/dkg/store-private-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          electionId: electionId.toString(),
          privateKey,
          publicKey: {
            p: publicKeyP || '0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF',
            g: publicKeyG || '0x02',
            h: publicKeyH
          }
        })
      });

      if (!storeKeyResponse.ok) {
        const errorData = await storeKeyResponse.json();
        throw new Error(errorData.error || 'Failed to store private key');
      }

      // Step 2: Decrypt votes
      const decryptResponse = await fetch(`${DECRYPTION_SERVICE_URL}/api/decrypt/batch`, {
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
      setTotalVotes(decryptData.totalVotes);
      setInvalidVotes(decryptData.invalidVotes || 0);
      
      setStep('review');
      setIsLoading(false);
    } catch (err) {
      console.error('Error during decryption:', err);
      setError(`Decryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  // Publish results to blockchain
  const handlePublish = async () => {
    if (!decryptionResults) return;

    setIsLoading(true);
    setStep('publish');
    setError('');

    try {
      const abi = AbiRegistry.create(votingAppAbi);
      const scFactory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      // Convert results to array of vote counts (matching candidate order)
      const voteCounts = candidates.map(candidate => 
        decryptionResults[candidate] || 0
      );

      const args = [
        new U64Value(BigInt(electionId)),
        ...voteCounts.map(count => new U64Value(BigInt(count)))
      ];

      const transaction = await scFactory.createTransactionForExecute(
        new Address(address),
        {
          contract: new Address(contractAddress),
          function: 'publishResults',
          gasLimit: BigInt(10_000_000),
          arguments: args
        }
      );

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Publishing election results...',
          errorMessage: 'Error publishing results',
          successMessage: 'Results published successfully!'
        }
      });

      // Clean up: delete private key from service
      try {
        await fetch(`${DECRYPTION_SERVICE_URL}/api/dkg/private-key/${electionId}`, {
          method: 'DELETE'
        });
      } catch (cleanupErr) {
        console.error('Warning: Failed to cleanup private key:', cleanupErr);
      }

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">🔓 Decrypt & Publish Results</h2>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          {/* Step Indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              {['fetch', 'decrypt', 'review', 'publish', 'success'].map((s, idx) => (
                <div key={s} className="flex items-center flex-1">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                    ${['fetch', 'decrypt', 'review', 'publish', 'success'].indexOf(step) >= idx
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                    }
                  `}>
                    {idx + 1}
                  </div>
                  {idx < 4 && (
                    <div className={`flex-1 h-1 mx-2 ${
                      ['fetch', 'decrypt', 'review', 'publish', 'success'].indexOf(step) > idx
                        ? 'bg-blue-600'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-600 dark:text-gray-400">
              <span>Fetch</span>
              <span>Decrypt</span>
              <span>Review</span>
              <span>Publish</span>
              <span>Done</span>
            </div>
          </div>

          {/* Step 1: Fetch Encrypted Votes */}
          {step === 'fetch' && (
            <div className="space-y-6 text-center py-8">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
              <p className="text-lg font-semibold">Fetching encrypted votes...</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Retrieving all encrypted ballots from the blockchain
              </p>
            </div>
          )}

          {/* Step 2: Enter Private Key */}
          {step === 'decrypt' && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>📊 Found {encryptedVotes.length} encrypted votes</strong><br />
                  Enter the private key generated during DKG to decrypt the votes.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Private Key (required) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                    placeholder="0x1234..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The secret key from your DKG session
                  </p>
                </div>

                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300">
                    Advanced: Custom ElGamal Parameters (optional)
                  </summary>
                  <div className="mt-3 space-y-3 pl-4">
                    <div>
                      <label className="block text-xs mb-1">Prime (p)</label>
                      <input
                        type="text"
                        value={publicKeyP}
                        onChange={(e) => setPublicKeyP(e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono text-xs"
                        placeholder="0xFFFF... (leave empty for default)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Generator (g)</label>
                      <input
                        type="text"
                        value={publicKeyG}
                        onChange={(e) => setPublicKeyG(e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono text-xs"
                        placeholder="0x02 (leave empty for default)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Public Key (h = g^x mod p)</label>
                      <input
                        type="text"
                        value={publicKeyH}
                        onChange={(e) => setPublicKeyH(e.target.value)}
                        className="w-full px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono text-xs"
                        placeholder="0xABCD... (required if using custom p,g)"
                      />
                    </div>
                  </div>
                </details>
              </div>

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
                  onClick={handleDecrypt}
                  disabled={!privateKey.trim() || isLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
                >
                  {isLoading ? 'Decrypting...' : '🔓 Decrypt Votes'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review Results */}
          {step === 'review' && decryptionResults && (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  <strong>✅ Decryption successful!</strong><br />
                  {totalVotes} votes decrypted successfully
                  {invalidVotes > 0 && ` (${invalidVotes} invalid votes excluded)`}
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
                  <strong>⚠️ Final Check:</strong> Once published, these results become immutable on the blockchain. 
                  Verify all counts are correct before proceeding.
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
                  📢 Publish to Blockchain
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
                The election results have been successfully stored on the blockchain and are now publicly viewable.
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
          {error && step !== 'decrypt' && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

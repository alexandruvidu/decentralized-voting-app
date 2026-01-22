'use client';

import { useState } from 'react';

interface VerifyResultsModalProps {
  electionId: number;
  onClose: () => void;
}

interface TallyProof {
  candidate: string;
  count: number;
  encryptedTally: {
    c1: string;
    c2: string;
  };
  decryptedValue: string;
  proof: {
    a1: string;
    a2: string;
    z: string;
    c: string;
  };
}

const CRYPTO_SERVICE_URL = process.env.NEXT_PUBLIC_CRYPTO_SERVICE_URL
  || process.env.NEXT_PUBLIC_DECRYPTION_SERVICE_URL
  || '/crypto-api';

export function VerifyResultsModal({ electionId, onClose }: VerifyResultsModalProps) {
  const [proofsJson, setProofsJson] = useState('');
  const [publicKeyJson, setPublicKeyJson] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failed'>('idle');
  const [verificationResults, setVerificationResults] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    setError('');
    setIsLoading(true);
    setVerificationStatus('verifying');

    try {
      // Parse input JSON
      const proofs: TallyProof[] = JSON.parse(proofsJson);
      const publicKey = JSON.parse(publicKeyJson);

      if (!Array.isArray(proofs) || proofs.length === 0) {
        throw new Error('Proofs must be a non-empty array');
      }

      if (!publicKey.p || !publicKey.g || !publicKey.h) {
        throw new Error('Public key must contain p, g, and h');
      }

      const results = [];

      // Verify each proof
      for (const tallyProof of proofs) {
        const response = await fetch(`${CRYPTO_SERVICE_URL}/api/verify/proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicKey,
            encryptedTally: tallyProof.encryptedTally,
            decryptedValue: tallyProof.decryptedValue,
            proof: tallyProof.proof
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Verification failed for ${tallyProof.candidate}: ${errorData.error}`);
        }

        const data = await response.json();
        results.push({
          candidate: tallyProof.candidate,
          count: tallyProof.count,
          valid: data.valid,
          verificationTimeMs: data.verificationTimeMs
        });
      }

      setVerificationResults(results);
      
      const allValid = results.every(r => r.valid);
      setVerificationStatus(allValid ? 'success' : 'failed');
      
      console.log('✅ Verification completed:', results);
    } catch (err) {
      console.error('Verification error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setVerificationStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  const loadExampleData = () => {
    // Example format for users
    const exampleProofs = [
      {
        candidate: "Alice",
        count: 5,
        encryptedTally: {
          c1: "0x1234...",
          c2: "0x5678..."
        },
        decryptedValue: "0x9abc...",
        proof: {
          a1: "0x...",
          a2: "0x...",
          z: "0x...",
          c: "0x..."
        }
      }
    ];

    const examplePublicKey = {
      p: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
      g: "0x2",
      h: "0x..."
    };

    setProofsJson(JSON.stringify(exampleProofs, null, 2));
    setPublicKeyJson(JSON.stringify(examplePublicKey, null, 2));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">🔍 Verify Election Results</h2>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          <div className="space-y-6">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Zero-Knowledge Proof Verification</strong><br />
                Verify that published results were correctly decrypted from encrypted votes,
                without needing to trust the decryption authority or know the private key.
              </p>
            </div>

            {verificationStatus === 'idle' && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Tally Proofs (JSON)
                  </label>
                  <textarea
                    value={proofsJson}
                    onChange={(e) => setProofsJson(e.target.value)}
                    placeholder='[{"candidate":"Alice","count":5,"encryptedTally":{"c1":"0x...","c2":"0x..."},"decryptedValue":"0x...","proof":{"a1":"0x...","a2":"0x...","z":"0x...","c":"0x..."}}]'
                    className="w-full h-48 px-3 py-2 border rounded-lg font-mono text-xs dark:bg-gray-900 dark:border-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Public Key (JSON)
                  </label>
                  <textarea
                    value={publicKeyJson}
                    onChange={(e) => setPublicKeyJson(e.target.value)}
                    placeholder='{"p":"0x...","g":"0x2","h":"0x..."}'
                    className="w-full h-24 px-3 py-2 border rounded-lg font-mono text-xs dark:bg-gray-900 dark:border-gray-700"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={loadExampleData}
                    className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Load Example
                  </button>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={!proofsJson || !publicKeyJson || isLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
                  >
                    {isLoading ? 'Verifying...' : '🔍 Verify Proofs'}
                  </button>
                </div>
              </>
            )}

            {verificationStatus === 'verifying' && (
              <div className="space-y-6 text-center py-8">
                <div className="inline-block">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
                <p className="text-lg font-semibold">Verifying proofs...</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Checking cryptographic signatures
                </p>
              </div>
            )}

            {(verificationStatus === 'success' || verificationStatus === 'failed') && (
              <div className="space-y-6">
                <div className={`p-4 rounded-lg border ${
                  verificationStatus === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                  <p className={`text-sm font-semibold ${
                    verificationStatus === 'success'
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-red-800 dark:text-red-200'
                  }`}>
                    {verificationStatus === 'success' 
                      ? '✅ All proofs verified successfully!'
                      : '❌ Verification failed!'
                    }
                  </p>
                  <p className={`text-xs mt-1 ${
                    verificationStatus === 'success'
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-red-700 dark:text-red-300'
                  }`}>
                    {verificationStatus === 'success'
                      ? 'The decryption was performed correctly and the published results are mathematically proven to match the encrypted votes.'
                      : 'One or more proofs failed verification. The results may have been tampered with.'
                    }
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Verification Results</h3>
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-2 text-left">Candidate</th>
                          <th className="px-4 py-2 text-right">Count</th>
                          <th className="px-4 py-2 text-right">Status</th>
                          <th className="px-4 py-2 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verificationResults.map((result, idx) => (
                          <tr key={idx} className="border-b last:border-b-0">
                            <td className="px-4 py-3">{result.candidate}</td>
                            <td className="px-4 py-3 text-right font-mono">{result.count}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                result.valid
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}>
                                {result.valid ? '✓ Valid' : '✗ Invalid'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-500">
                              {result.verificationTimeMs}ms
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setVerificationStatus('idle');
                      setVerificationResults([]);
                      setError('');
                    }}
                    className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    ← Verify Another
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

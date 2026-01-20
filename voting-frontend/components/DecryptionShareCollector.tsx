'use client';

import { useState, useRef } from 'react';

interface DecryptionShare {
  trusteeIndex: number;
  share: string; // Base64 encoded decryption share
  timestamp: string;
}

interface DecryptionShareCollectorProps {
  electionId: number;
  requiredShares: number;
  totalTrustees: number;
  onSharesReady: (shares: DecryptionShare[]) => void;
}

export function DecryptionShareCollector({
  electionId,
  requiredShares = 3,
  totalTrustees = 5,
  onSharesReady
}: DecryptionShareCollectorProps) {
  const [shares, setShares] = useState<DecryptionShare[]>([]);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const share: DecryptionShare = {
        trusteeIndex: shares.length,
        share: content,
        timestamp: new Date().toISOString()
      };

      const newShares = [...shares, share];
      setShares(newShares);

      // Auto-proceed if we have enough shares
      if (newShares.length >= requiredShares) {
        setStep('review');
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      alert(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const removeShare = (index: number) => {
    setShares(shares.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-blue-50', 'dark:bg-blue-900/20');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-blue-50', 'dark:bg-blue-900/20');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-blue-50', 'dark:bg-blue-900/20');

    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const content = await file.text();
        const share: DecryptionShare = {
          trusteeIndex: shares.length + i,
          share: content,
          timestamp: new Date().toISOString()
        };

        setShares(prev => [...prev, share]);
      } catch (error) {
        console.error(`Failed to read ${file.name}:`, error);
      }
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Threshold Decryption:</strong> You need {requiredShares} of {totalTrustees} decryption shares to decrypt the vote tally. Collect shares from trustees and upload them here.
        </p>
      </div>

      {step === 'upload' && (
        <div className="space-y-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center transition-colors cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <div className="space-y-2">
              <div className="text-4xl">📁</div>
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  Drag and drop decryption shares here
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">or click to select files</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept=".txt,.json,.base64"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Browse Files
            </button>
          </div>

          {shares.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">
                Collected Shares ({shares.length}/{requiredShares})
              </h3>
              <div className="space-y-2">
                {shares.map((share, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                        Share {index + 1}
                      </p>
                      <p className="text-xs text-gray-500">
                        {share.timestamp}
                      </p>
                    </div>
                    <button
                      onClick={() => removeShare(index)}
                      className="px-3 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {shares.length >= requiredShares && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    ✅ <strong>Ready!</strong> You have {shares.length} shares (need {requiredShares}). You can now proceed to decrypt the votes.
                  </p>
                </div>
              )}

              <button
                onClick={() => setStep('review')}
                disabled={shares.length < requiredShares}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                Proceed to Decryption
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-6">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200">
              ✅ <strong>All shares collected!</strong> ({shares.length}/{requiredShares})
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Next Steps</h3>
            <ol className="space-y-2 text-sm">
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">1.</span>
                <span>Use a threshold cryptography library (e.g., threshold-crypto in Rust, or similar in your language)</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">2.</span>
                <span>Combine the {shares.length} decryption shares using Shamir's secret sharing interpolation</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">3.</span>
                <span>Use the combined decryption key to decrypt each encrypted vote using ElGamal decryption</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">4.</span>
                <span>Count votes for each candidate</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">5.</span>
                <span>Submit the final vote tally using "Publish Results"</span>
              </li>
            </ol>
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-xs text-yellow-800 dark:text-yellow-200 font-mono">
              <strong>Note:</strong> The decryption process requires cryptographic operations that are best done in a specialized environment. Consider using a tool like <code>mpz_library</code> or <code>zksnark-framework</code> for Shamir's secret sharing.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('upload')}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Back
            </button>
            <button
              onClick={() => onSharesReady(shares)}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              Download Shares for Decryption
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

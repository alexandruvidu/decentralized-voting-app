'use client';

import { useState } from 'react';
import { 
  AbiRegistry,
  Address,
  SmartContractTransactionsFactory,
  TransactionsFactoryConfig,
  U64Value,
  BytesValue
} from '@multiversx/sdk-core';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { contractAddress } from '@/config';
import votingAppAbi from '@/contracts/voting-app.abi.json';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';

interface PublishResultsModalProps {
  electionId: number;
  onClose: () => void;
  onSuccess: () => void;
}

interface CandidateResult {
  name: string;
  votes: number;
}

export function PublishResultsModal({ electionId, onClose, onSuccess }: PublishResultsModalProps) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [step, setStep] = useState<'input' | 'confirm' | 'submitting' | 'success'>('input');
  const [results, setResults] = useState<CandidateResult[]>([
    { name: '', votes: 0 }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const addCandidate = () => {
    setResults([...results, { name: '', votes: 0 }]);
  };

  const updateCandidate = (index: number, field: 'name' | 'votes', value: string | number) => {
    const newResults = [...results];
    if (field === 'name') {
      newResults[index].name = value as string;
    } else {
      newResults[index].votes = parseInt(value as string) || 0;
    }
    setResults(newResults);
  };

  const removeCandidate = (index: number) => {
    if (results.length > 1) {
      setResults(results.filter((_, i) => i !== index));
    }
  };

  const validateResults = () => {
    if (results.some(r => !r.name.trim())) {
      setError('All candidate names are required');
      return false;
    }
    if (results.some(r => r.votes < 0)) {
      setError('Vote counts cannot be negative');
      return false;
    }
    const totalVotes = results.reduce((sum, r) => sum + r.votes, 0);
    if (totalVotes === 0) {
      setError('At least one candidate must have votes');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    if (!validateResults()) return;

    setStep('confirm');
  };

  const handlePublishResults = async () => {
    setIsLoading(true);
    setStep('submitting');

    try {
      const abi = AbiRegistry.create(votingAppAbi);
      const scFactory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      // Encode results as MultiValue<u64>: candidate_count_1, candidate_count_2, ...
      const args = [
        new U64Value(BigInt(electionId)),
        ...results.map(r => new U64Value(BigInt(r.votes)))
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

      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error publishing results:', error);
      setError(`Failed to publish results: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
      setStep('input');
    }
  };

  const totalVotes = results.reduce((sum, r) => sum + r.votes, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Publish Election Results</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          {step === 'input' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Candidate Results</h3>
                  <button
                    onClick={addCandidate}
                    className="text-sm px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    + Add Candidate
                  </button>
                </div>

                <div className="space-y-3">
                  {results.map((result, index) => (
                    <div key={index} className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="text-sm text-gray-600 dark:text-gray-400">Candidate Name</label>
                        <input
                          type="text"
                          value={result.name}
                          onChange={(e) => updateCandidate(index, 'name', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                          placeholder="e.g., Alice Johnson"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-sm text-gray-600 dark:text-gray-400">Votes</label>
                        <input
                          type="number"
                          value={result.votes}
                          onChange={(e) => updateCandidate(index, 'votes', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                          min="0"
                        />
                      </div>
                      {results.length > 1 && (
                        <button
                          onClick={() => removeCandidate(index)}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <p className="text-sm font-semibold">Total Votes: {totalVotes}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={results.some(r => !r.name.trim()) || totalVotes === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Confirm & Review
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Review Results</h3>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-2 text-left">Candidate</th>
                          <th className="px-4 py-2 text-right">Votes</th>
                          <th className="px-4 py-2 text-right">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((result, index) => (
                          <tr key={index} className="border-b last:border-b-0">
                            <td className="px-4 py-3">{result.name}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">{result.votes}</td>
                            <td className="px-4 py-3 text-right">
                              {totalVotes > 0 ? ((result.votes / totalVotes) * 100).toFixed(1) : 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>⚠️ Important:</strong> Once submitted, these results become immutable on the blockchain. Verify all counts are correct before confirming.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Back
                </button>
                <button
                  onClick={handlePublishResults}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-semibold"
                >
                  {isLoading ? 'Publishing...' : 'Publish Results'}
                </button>
              </div>
            </div>
          )}

          {step === 'submitting' && (
            <div className="space-y-6 text-center py-8">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
              </div>
              <p className="text-lg font-semibold">Publishing results...</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Please sign the transaction in your wallet</p>
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-6 text-center py-8">
              <div className="text-5xl">✅</div>
              <p className="text-xl font-bold">Results Published!</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                The election results have been successfully stored on the blockchain and are now immutable.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

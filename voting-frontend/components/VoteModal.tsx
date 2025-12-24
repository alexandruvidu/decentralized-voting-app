'use client';

import { useState } from 'react';
import { Buffer } from 'buffer';
import { 
  AbiRegistry, 
  Address, 
  SmartContractTransactionsFactory, 
  TransactionsFactoryConfig 
} from '@multiversx/sdk-core';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { contractAddress } from '@/config';
import { Election } from '@/types/election';
import { useGetElectionResults } from '@/hooks/useElections';
import votingAppAbi from '@/contracts/voting-app.abi.json';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';

interface VoteModalProps {
  election: Election;
  onClose: () => void;
  onSuccess: () => void;
}

export function VoteModal({ election, onClose, onSuccess }: VoteModalProps) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { results, loading } = useGetElectionResults(election.id);

  const candidates = results.map(r => r.candidate);

  const handleVote = async () => {
    if (!selectedCandidate) {
      alert('Please select a candidate');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create transaction using SmartContractTransactionsFactory
      const abi = AbiRegistry.create(votingAppAbi);
      const scFactory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      const transaction = await scFactory.createTransactionForExecute(
        new Address(address),
        {
          contract: new Address(contractAddress),
          function: 'vote',
          gasLimit: BigInt(6_000_000),
          arguments: [election.id, Buffer.from(selectedCandidate)]
        }
      );

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Submitting your vote...',
          errorMessage: 'Error submitting vote',
          successMessage: 'Vote submitted successfully!'
        }
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error voting:', error);
      alert('Failed to submit vote');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Vote in {election.name}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Select your candidate below. You can only vote once.
                </p>
                
                <div className="space-y-2">
                  {candidates.map((candidate) => (
                    <label
                      key={candidate}
                      className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedCandidate === candidate
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="candidate"
                        value={candidate}
                        checked={selectedCandidate === candidate}
                        onChange={(e) => setSelectedCandidate(e.target.value)}
                        className="mr-3"
                      />
                      <span className="font-medium">{candidate}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVote}
                  disabled={isSubmitting || !selectedCandidate}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Vote'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

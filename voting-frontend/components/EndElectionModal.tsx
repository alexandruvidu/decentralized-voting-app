'use client';

import { useState } from 'react';
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
import { Election } from '@/types/election';
import votingAppAbi from '@/contracts/voting-app.abi.json';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';

interface EndElectionModalProps {
  election: Election;
  onClose: () => void;
  onSuccess: () => void;
}

export function EndElectionModal({ election, onClose, onSuccess }: EndElectionModalProps) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [step, setStep] = useState<'confirm' | 'ending' | 'success' | 'retrieve'>('confirm');
  const [encryptedVotes, setEncryptedVotes] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const currentTime = Math.floor(Date.now() / 1000);
  const electionEnded = currentTime > election.end_time;

  const handleEndElection = async (force: boolean) => {
    setIsLoading(true);
    setStep('ending');

    try {
      const abi = AbiRegistry.create(votingAppAbi);
      const scFactory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      const transaction = await scFactory.createTransactionForExecute(
        new Address(address),
        {
          contract: new Address(contractAddress),
          function: force ? 'forceEndElection' : 'endElection',
          gasLimit: BigInt(10_000_000),
          arguments: [new U64Value(BigInt(election.id))]
        }
      );

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Ending election...',
          errorMessage: 'Error ending election',
          successMessage: 'Election ended successfully!'
        }
      });

      setIsLoading(false);
      // Notify parent so the elections list refreshes and status moves to Ended
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error ending election:', error);
      alert(`Failed to end election: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
      setStep('confirm');
    }
  };

  const handleRetrieveEncryptedVotes = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(
        `https://devnet-gateway.multiversx.com/vm-values/query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scAddress: contractAddress,
            funcName: 'getEncryptedVotes',
            args: [Buffer.from(election.id.toString()).toString('hex')]
          })
        }
      );

      const data = await response.json();
      if (data.data?.data?.returnData) {
        const votes = data.data.data.returnData.map((v: string) => v);
        setEncryptedVotes(votes);
        setStep('success');
      }
    } catch (error) {
      console.error('Error retrieving encrypted votes:', error);
      alert('Failed to retrieve encrypted votes');
    } finally {
      setIsLoading(false);
    }
  };

  const copyVotesToClipboard = async () => {
    if (!encryptedVotes) return;
    
    const votesJson = JSON.stringify({
      electionId: election.id,
      electionName: election.name,
      totalEncryptedVotes: encryptedVotes.length,
      encryptedVotes: encryptedVotes,
      timestamp: new Date().toISOString()
    }, null, 2);

    try {
      await navigator.clipboard.writeText(votesJson);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      alert('Failed to copy to clipboard');
    }
  };

  const downloadVotesJson = () => {
    if (!encryptedVotes) return;

    const votesJson = JSON.stringify({
      electionId: election.id,
      electionName: election.name,
      totalEncryptedVotes: encryptedVotes.length,
      encryptedVotes: encryptedVotes,
      timestamp: new Date().toISOString()
    }, null, 2);

    const blob = new Blob([votesJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `election-${election.id}-encrypted-votes.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">End Election & Decrypt Votes</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          {step === 'confirm' && (
            <div className="space-y-6">
              {!electionEnded && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ <strong>Election is still ongoing.</strong> You can use "Force End" to end it immediately, but normally you should wait until the scheduled end time.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Election Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">ID</p>
                    <p className="font-mono font-semibold">{election.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Name</p>
                    <p className="font-semibold">{election.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">End Time</p>
                    <p className="text-sm">
                      {new Date(election.end_time * 1000).toLocaleString()}
                      {electionEnded && <span className="text-green-600 ml-2">✓ Ended</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                    <p className="text-sm font-semibold">
                      {electionEnded ? '🔒 Closed' : '🟢 Open'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                {!electionEnded && (
                  <button
                    onClick={() => handleEndElection(true)}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400"
                  >
                    {isLoading ? 'Processing...' : 'Force End Now'}
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'ending' && (
            <div className="space-y-6 text-center">
              <div className="py-8">
                <div className="inline-block">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              </div>
              <p className="text-lg font-semibold">Ending election...</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Please sign the transaction in your wallet</p>
            </div>
          )}

          {step === 'retrieve' && (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  ✅ <strong>Election ended successfully!</strong>
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Retrieve Encrypted Votes</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Now you need to retrieve all encrypted votes from the blockchain. These will be sent to trustees for threshold decryption.
                </p>
                
                <button
                  onClick={handleRetrieveEncryptedVotes}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
                >
                  {isLoading ? 'Retrieving Votes...' : 'Retrieve Encrypted Votes'}
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {step === 'success' && encryptedVotes && (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  ✅ <strong>{encryptedVotes.length} encrypted votes retrieved!</strong>
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">What to Do Next</h3>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>1. Download or copy the encrypted votes file</strong></p>
                  <p><strong>2. Send to your 5 trustees</strong> (via secure channel)</p>
                  <p><strong>3. Each trustee creates a decryption share</strong> using their private key share</p>
                  <p><strong>4. Collect at least 3 decryption shares</strong> (3-of-5 threshold)</p>
                  <p><strong>5. Use threshold crypto library to combine</strong> shares and decrypt votes</p>
                  <p><strong>6. Count votes</strong> for each candidate</p>
                  <p><strong>7. Submit final tally</strong> via "Publish Results" on the election page</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Encrypted Votes Summary</h3>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
                  <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                    {encryptedVotes.length} votes • Election {election.id}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={copyVotesToClipboard}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors ${
                    copySuccess
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {copySuccess ? '✓ Copied!' : 'Copy to Clipboard'}
                </button>
                <button
                  onClick={downloadVotesJson}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                >
                  Download JSON
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
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

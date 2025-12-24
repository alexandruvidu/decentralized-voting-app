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
import votingAppAbi from '@/contracts/voting-app.abi.json';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';

interface AddVotersModalProps {
  electionId: number;
  electionName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddVotersModal({ electionId, electionName, onClose, onSuccess }: AddVotersModalProps) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [voterAddresses, setVoterAddresses] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Parse addresses (one per line or comma-separated)
      const addressList = voterAddresses
        .split(/[\n,]+/)
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0);

      if (addressList.length === 0) {
        alert('Please add at least one voter address');
        setIsSubmitting(false);
        return;
      }

      // Check for duplicates in the list
      const uniqueAddresses = new Set(addressList);
      if (uniqueAddresses.size !== addressList.length) {
        alert('Duplicate addresses found in the list. Each address should only appear once.');
        setIsSubmitting(false);
        return;
      }

      // Validate addresses
      const validAddresses: Address[] = [];
      for (const addr of addressList) {
        try {
          validAddresses.push(new Address(addr));
        } catch (e) {
          alert(`Invalid address: ${addr}`);
          setIsSubmitting(false);
          return;
        }
      }

      // Create transaction
      const abi = AbiRegistry.create(votingAppAbi);
      const scFactory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      const transaction = await scFactory.createTransactionForExecute(
        new Address(address),
        {
          contract: new Address(contractAddress),
          function: 'addVoters',
          gasLimit: BigInt(5_000_000 + (validAddresses.length * 500_000)), // Scale gas with number of voters
          arguments: [
            electionId,
            ...validAddresses
          ]
        }
      );

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Adding voters...',
          errorMessage: 'Error adding voters',
          successMessage: `Successfully added ${validAddresses.length} voter(s)!`
        }
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error adding voters:', error);
      alert('Failed to add voters');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Add Eligible Voters</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Election: <span className="font-semibold">{electionName}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Voter Addresses
              </label>
              <textarea
                required
                value={voterAddresses}
                onChange={(e) => setVoterAddresses(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                rows={8}
                placeholder="erd1abc123...&#10;erd1def456...&#10;erd1ghi789..."
              />
              <p className="text-sm text-gray-500 mt-1">
                Enter MultiversX addresses (one per line or comma-separated)
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                💡 <strong>Tip:</strong> You can add voters in batches. Call this multiple times if needed.
                Gas cost scales with the number of addresses (~500k per address).
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Adding Voters...' : 'Add Voters'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

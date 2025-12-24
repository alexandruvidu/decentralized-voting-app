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

interface CreateElectionFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateElectionForm({ onClose, onSuccess }: CreateElectionFormProps) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    candidates: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get current UTC date/time for min attribute
  const nowUTC = new Date();
  const minDate = nowUTC.toISOString().split('T')[0];
  const minTime = nowUTC.toISOString().split('T')[1].slice(0, 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Convert dates to UTC timestamps
      const startUTC = new Date(`${formData.startDate}T${formData.startTime}:00Z`);
      const endUTC = new Date(`${formData.endDate}T${formData.endTime}:00Z`);
      const startTimestamp = Math.floor(startUTC.getTime() / 1000);
      const endTimestamp = Math.floor(endUTC.getTime() / 1000);
      
      // Parse candidates
      const candidatesList = formData.candidates
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      if (candidatesList.length === 0) {
        alert('Please add at least one candidate');
        setIsSubmitting(false);
        return;
      }

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
          function: 'createElection',
          gasLimit: BigInt(10_000_000),
          arguments: [
            Buffer.from(formData.name),
            startTimestamp,
            endTimestamp,
            ...candidatesList.map((c) => Buffer.from(c))
          ]
        }
      );

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Creating election...',
          errorMessage: 'Error creating election',
          successMessage: 'Election created successfully!'
        }
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating election:', error);
      alert('Failed to create election');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Create New Election</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Election Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                placeholder="e.g., Student Council Elections 2024"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                ⏰ <strong>Note:</strong> All times are in <strong>UTC</strong>. The blockchain validates election times against UTC timestamps.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Start Date (UTC)
                </label>
                <input
                  type="date"
                  required
                  min={minDate}
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Start Time (UTC)
                </label>
                <input
                  type="time"
                  required
                  min={formData.startDate === minDate ? minTime : undefined}
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  End Date (UTC)
                </label>
                <input
                  type="date"
                  required
                  min={formData.startDate || minDate}
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  End Time (UTC)
                </label>
                <input
                  type="time"
                  required
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Candidates (comma-separated)
              </label>
              <textarea
                required
                value={formData.candidates}
                onChange={(e) => setFormData({ ...formData, candidates: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                rows={3}
                placeholder="Alice, Bob, Charlie"
              />
              <p className="text-sm text-gray-500 mt-1">
                Separate candidate names with commas
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
                {isSubmitting ? 'Creating...' : 'Create Election'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

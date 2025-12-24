'use client';

import { useEffect, useState } from 'react';
import { useGetLoginInfo } from '@multiversx/sdk-dapp/out/react/loginInfo/useGetLoginInfo';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { UnlockPanelManager } from '@multiversx/sdk-dapp/out/managers/UnlockPanelManager';
import { getAccountProvider } from '@multiversx/sdk-dapp/out/providers/helpers/accountProvider';
import { useGetAllElections } from '@/hooks/useElections';
import { ElectionList } from '@/components/ElectionList';
import { CreateElectionForm } from '@/components/CreateElectionForm';
import { VoteModal } from '@/components/VoteModal';
import { ResultsModal } from '@/components/ResultsModal';
import { AddVotersModal } from '@/components/AddVotersModal';
import { Election } from '@/types/election';

export default function Home() {
  const { isLoggedIn } = useGetLoginInfo();
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const { elections, loading, refetch } = useGetAllElections();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedElectionForVoting, setSelectedElectionForVoting] = useState<Election | null>(null);
  const [selectedElectionForResults, setSelectedElectionForResults] = useState<Election | null>(null);
  const [selectedElectionForVoters, setSelectedElectionForVoters] = useState<Election | null>(null);
  const [unlockPanelManager, setUnlockPanelManager] = useState<UnlockPanelManager | null>(null);

  useEffect(() => {
    // Initialize unlock panel manager
    const manager = UnlockPanelManager.init({
      loginHandler: () => {
        console.log('Login successful');
        refetch(); // Refresh elections after login
      },
      onClose: () => {
        console.log('Unlock panel closed');
      }
    });
    setUnlockPanelManager(manager);

    return () => {
      // Cleanup on unmount
    };
  }, []);

  const handleLogin = () => {
    if (unlockPanelManager) {
      unlockPanelManager.openUnlockPanel();
    }
  };

  const handleLogout = async () => {
    const provider = getAccountProvider();
    await provider.logout();
  };

  const handleVoteSuccess = () => {
    refetch();
  };

  const handleCreateSuccess = () => {
    refetch();
  };

  const handleFinalize = async (election: Election) => {
    if (!confirm(`Finalize "${election.name}"? This will compute and store results.`)) {
      return;
    }

    try {
      const { AbiRegistry, Address, SmartContractTransactionsFactory, TransactionsFactoryConfig } = await import('@multiversx/sdk-core');
      const { signAndSendTransactions } = await import('@/helpers/signAndSendTransactions');
      const { contractAddress } = await import('@/config');
      const votingAppAbi = await import('@/contracts/voting-app.abi.json');

      const abi = AbiRegistry.create(votingAppAbi);
      
      const scFactory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      const transaction = await scFactory.createTransactionForExecute(
        new Address(address),
        {
          contract: new Address(contractAddress),
          function: 'endElection',
          gasLimit: BigInt(10_000_000),
          arguments: [election.id]
        }
      );

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Finalizing election...',
          errorMessage: 'Failed to finalize',
          successMessage: 'Election finalized!'
        }
      });

      refetch();
    } catch (error) {
      console.error('Error finalizing election:', error);
      alert('Failed to finalize election');
    }
  };

  const handleForceEnd = async (election: Election) => {
    if (!confirm(`Force end "${election.name}"? This will finalize the election immediately.`)) {
      return;
    }

    try {
      const { AbiRegistry, Address, SmartContractTransactionsFactory, TransactionsFactoryConfig } = await import('@multiversx/sdk-core');
      const { signAndSendTransactions } = await import('@/helpers/signAndSendTransactions');
      const { contractAddress } = await import('@/config');
      const votingAppAbi = await import('@/contracts/voting-app.abi.json');

      const abi = AbiRegistry.create(votingAppAbi);
      
      const scFactory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      const transaction = await scFactory.createTransactionForExecute(
        new Address(address),
        {
          contract: new Address(contractAddress),
          function: 'forceEndElection',
          gasLimit: BigInt(10_000_000),
          arguments: [election.id]
        }
      );

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Forcing election end...',
          errorMessage: 'Failed to end election',
          successMessage: 'Election ended successfully!'
        }
      });

      refetch();
    } catch (error) {
      console.error('Error ending election:', error);
      alert('Failed to end election');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🗳️ Decentralized Voting</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Secure, transparent blockchain voting</p>
            </div>
            
            {isLoggedIn && (
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Connected as</p>
                  <p className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {address.slice(0, 10)}...{address.slice(-8)}
                  </p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isLoggedIn ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">🔐</div>
                <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Connect your MultiversX wallet to participate in elections
                </p>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={handleLogin}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Action Bar */}
            <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">All Elections</h2>
                <p className="text-gray-600 dark:text-gray-400">Browse and participate in elections</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => refetch()}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  + Create Election
                </button>
              </div>
            </div>

            {/* Elections List */}
            <ElectionList
              elections={elections}
              loading={loading}
              onVote={(election) => setSelectedElectionForVoting(election)}
              onViewResults={(election) => setSelectedElectionForResults(election)}
              onAddVoters={(election) => setSelectedElectionForVoters(election)}
              onForceEnd={handleForceEnd}
              onFinalize={handleFinalize}
            />
          </>
        )}
      </main>

      {/* Modals */}
      {showCreateForm && (
        <CreateElectionForm
          onClose={() => setShowCreateForm(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {selectedElectionForVoting && (
        <VoteModal
          election={selectedElectionForVoting}
          onClose={() => setSelectedElectionForVoting(null)}
          onSuccess={handleVoteSuccess}
        />
      )}

      {selectedElectionForResults && (
        <ResultsModal
          election={selectedElectionForResults}
          onClose={() => setSelectedElectionForResults(null)}
        />
      )}

      {selectedElectionForVoters && (
        <AddVotersModal
          electionId={selectedElectionForVoters.id}
          electionName={selectedElectionForVoters.name}
          onClose={() => setSelectedElectionForVoters(null)}
          onSuccess={() => {
            setSelectedElectionForVoters(null);
          }}
        />
      )}

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Built on MultiversX Blockchain • Secure & Transparent Voting
          </p>
        </div>
      </footer>
    </div>
  );
}

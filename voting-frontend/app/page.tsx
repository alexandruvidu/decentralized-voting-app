'use client';

import { useEffect, useState } from 'react';
import { useGetLoginInfo } from '@multiversx/sdk-dapp/out/react/loginInfo/useGetLoginInfo';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { UnlockPanelManager } from '@multiversx/sdk-dapp/out/managers/UnlockPanelManager';
import { getAccountProvider } from '@multiversx/sdk-dapp/out/providers/helpers/accountProvider';
import { useGetAllElections } from '@/hooks/useElections';
import { useIsOrganizer } from '@/hooks/useIsOrganizer';
import { ElectionList } from '@/components/ElectionList';
import { CreateElectionForm } from '@/components/CreateElectionForm';
import { VoteModal } from '@/components/VoteModal';
import { ResultsModal } from '@/components/ResultsModal';
import { AddVotersModal } from '@/components/AddVotersModal';
import { EndElectionModal } from '@/components/EndElectionModal';
import { ThresholdDecryptModal } from '@/components/ThresholdDecryptModal';
import { Election } from '@/types/election';

export default function Home() {
  const { isLoggedIn } = useGetLoginInfo();
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const { elections, loading, refetch, markEnded } = useGetAllElections();
  const { isOrganizer, loading: organizerLoading } = useIsOrganizer();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedElectionForVoting, setSelectedElectionForVoting] = useState<Election | null>(null);
  const [selectedElectionForResults, setSelectedElectionForResults] = useState<Election | null>(null);
  const [selectedElectionForVoters, setSelectedElectionForVoters] = useState<Election | null>(null);
  const [selectedElectionForEnd, setSelectedElectionForEnd] = useState<Election | null>(null);
  const [selectedElectionForPublish, setSelectedElectionForPublish] = useState<number | null>(null);
  const [unlockPanelManager, setUnlockPanelManager] = useState<UnlockPanelManager | null>(null);

  useEffect(() => {
    // Initialize unlock panel manager
    const manager = UnlockPanelManager.init({
      loginHandler: () => {
        console.log('Login successful');
        // Refetch elections to update the UI with the new address
        refetch();
      },
      onClose: () => {
        console.log('Unlock panel closed');
      }
    });
    setUnlockPanelManager(manager);

    return () => {
      // Cleanup on unmount
    };
  }, [refetch]);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex justify-between items-center">
            <div className="animate-fade-in">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">🗳️ Decentralized Voting</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Secure, transparent blockchain voting</p>
            </div>
            
            {isLoggedIn && (
              <div className="flex items-center gap-4 animate-slide-in">
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Connected</p>
                  <p className="font-mono text-xs bg-gradient-to-r from-blue-100 to-purple-100 dark:from-gray-700 dark:to-gray-600 px-3 py-2 rounded-lg max-w-xs overflow-x-auto border border-blue-200 dark:border-gray-600">
                    {address}
                  </p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all shadow-md hover:shadow-lg flex-shrink-0 font-medium"
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
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-10 max-w-md w-full border border-gray-200 dark:border-gray-700 smooth-shadow">
              <div className="text-center mb-8">
                <div className="text-7xl mb-6 animate-pulse">🔐</div>
                <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Connect Your Wallet</h2>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  Connect your MultiversX wallet to participate in secure blockchain elections
                </p>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={handleLogin}
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Action Bar */}
            <div className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-slide-in">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">All Elections</h2>
                <div className="flex items-center gap-2">
                  <p className="text-gray-600 dark:text-gray-400">
                    {isOrganizer ? '👑 Manage your elections' : '🗳️ Browse and participate in elections'}
                  </p>
                  {organizerLoading && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                      <span className="animate-pulse">⏳</span> Checking role...
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => refetch()}
                  className="px-5 py-2.5 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-all shadow-md hover:shadow-lg font-medium flex items-center gap-2"
                >
                  🔄 Refresh
                </button>
                {isOrganizer && !organizerLoading && (
                  <>
                    <a
                      href="/dkg"
                      className="px-6 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all font-medium shadow-md hover:shadow-lg transform hover:scale-[1.02] flex items-center gap-2"
                    >
                      🔐 DKG Keys
                    </a>
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all font-medium shadow-md hover:shadow-lg transform hover:scale-[1.02]"
                    >
                      + Create Election
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Elections List */}
            <ElectionList
              elections={elections}
              loading={loading}
              onVote={(election) => setSelectedElectionForVoting(election)}
              onViewResults={(election) => setSelectedElectionForResults(election)}
              onAddVoters={(election) => setSelectedElectionForVoters(election)}
              onEndElection={(election) => setSelectedElectionForEnd(election)}
              onPublishResults={(electionId) => setSelectedElectionForPublish(electionId)}
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

      {selectedElectionForEnd && (
        <EndElectionModal
          election={selectedElectionForEnd}
          onClose={() => setSelectedElectionForEnd(null)}
          onSuccess={() => {
            if (selectedElectionForEnd) {
              markEnded(selectedElectionForEnd.id);
            }
            setSelectedElectionForEnd(null);
            // Wait longer for indexer to catch up before refetch (3 seconds)
            setTimeout(() => {
              refetch();
            }, 3000);
          }}
        />
      )}

      {selectedElectionForPublish !== null && (
        <ThresholdDecryptModal
          electionId={selectedElectionForPublish}
          candidates={
            elections.find(e => e.id === selectedElectionForPublish)?.candidates || []
          }
          onClose={() => setSelectedElectionForPublish(null)}
          onSuccess={() => {
            refetch();
            setSelectedElectionForPublish(null);
          }}
        />
      )}

      {/* Footer */}
      <footer className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              🔒 Built on MultiversX Blockchain
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Secure • Transparent • Decentralized
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

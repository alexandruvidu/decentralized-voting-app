'use client';

import { Election, ElectionStatus, getElectionStatus } from '@/types/election';
import { useIsOrganizer } from '@/hooks/useIsOrganizer';

interface ElectionCardProps {
  election: Election;
  onVote: (election: Election) => void;
  onViewResults: (election: Election) => void;
  onAddVoters?: (election: Election) => void;
  onForceEnd?: (election: Election) => void;
  onFinalize?: (election: Election) => void;
}

export function ElectionCard({ election, onVote, onViewResults, onAddVoters, onForceEnd, onFinalize }: ElectionCardProps) {
  const status = getElectionStatus(election);
  const { isOrganizer, loading } = useIsOrganizer();
  
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusColor = (status: ElectionStatus) => {
    switch (status) {
      case ElectionStatus.UPCOMING:
        return 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 dark:from-blue-900 dark:to-blue-800 dark:text-blue-200';
      case ElectionStatus.ACTIVE:
        return 'bg-gradient-to-r from-green-100 to-emerald-200 text-green-800 dark:from-green-900 dark:to-emerald-800 dark:text-green-200';
      case ElectionStatus.ENDED:
        return 'bg-gradient-to-r from-yellow-100 to-orange-200 text-yellow-800 dark:from-yellow-900 dark:to-orange-800 dark:text-yellow-200';
      case ElectionStatus.FINALIZED:
        return 'bg-gradient-to-r from-purple-100 to-purple-200 text-purple-800 dark:from-purple-900 dark:to-purple-800 dark:text-purple-200';
    }
  };

  const getStatusText = (status: ElectionStatus) => {
    switch (status) {
      case ElectionStatus.UPCOMING:
        return 'Upcoming';
      case ElectionStatus.ACTIVE:
        return 'Active';
      case ElectionStatus.ENDED:
        return 'Ended';
      case ElectionStatus.FINALIZED:
        return 'Finalized';
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-6 bg-white dark:bg-gray-800 smooth-shadow hover:shadow-xl transition-all animate-slide-in">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{election.name}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {loading && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-full font-medium">
                <span className="animate-pulse">⏳</span> Checking role
              </span>
            )}
            {!loading && isOrganizer === true && (
              <span className="inline-flex items-center gap-1 text-xs bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-full font-semibold border border-purple-200 dark:border-purple-700">
                👑 Organizer
              </span>
            )}
            {!loading && isOrganizer === false && (
              <span className="inline-flex items-center gap-1 text-xs bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full font-semibold border border-blue-200 dark:border-blue-700">
                👤 Voter
              </span>
            )}
          </div>
        </div>
        <span className={`px-4 py-2 rounded-xl text-sm font-bold shadow-sm ${getStatusColor(status)}`}>
          {getStatusText(status)}
        </span>
      </div>
      
      <div className="space-y-3 text-sm mb-6">
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <span className="font-semibold text-gray-700 dark:text-gray-300 min-w-[80px]">📋 ID:</span>
          <span className="text-gray-600 dark:text-gray-400 font-mono">{election.id}</span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <span className="font-semibold text-gray-700 dark:text-gray-300 min-w-[80px]">🚀 Starts:</span>
          <span className="text-gray-600 dark:text-gray-400">{formatDate(election.start_time)}</span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <span className="font-semibold text-gray-700 dark:text-gray-300 min-w-[80px]">🏁 Ends:</span>
          <span className="text-gray-600 dark:text-gray-400">{formatDate(election.end_time)}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {/* Organizer Interface */}
        {isOrganizer ? (
          <>
            {status === ElectionStatus.UPCOMING && (
              <>
                <button
                  disabled
                  className="flex-1 px-4 py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-xl cursor-not-allowed font-medium"
                >
                  ⏰ Not Started
                </button>
                {onAddVoters && (
                  <button
                    onClick={() => onAddVoters(election)}
                    className="px-5 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md hover:shadow-lg font-medium"
                    title="Add eligible voters"
                  >
                    👥 Add Voters
                  </button>
                )}
              </>
            )}
            {status === ElectionStatus.ACTIVE && (
              <>
                {onAddVoters && (
                  <button
                    onClick={() => onAddVoters(election)}
                    className="flex-1 px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg font-medium"
                  >
                    👥 Add Voters
                  </button>
                )}
                {onForceEnd && (
                  <button
                    onClick={() => onForceEnd(election)}
                    className="px-5 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 transition-all shadow-md hover:shadow-lg font-medium"
                    title="Force end election (testing)"
                  >
                    🛑 Force End
                  </button>
                )}
              </>
            )}
            {status === ElectionStatus.ENDED && onFinalize && (
              <button
                onClick={() => onFinalize(election)}
                className="flex-1 px-5 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-md hover:shadow-lg font-medium"
              >
                ✅ Finalize Results
              </button>
            )}
            {status === ElectionStatus.FINALIZED && (
              <button
                onClick={() => onViewResults(election)}
                className="flex-1 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg font-medium"
              >
                📊 View Results
              </button>
            )}
          </>
        ) : (
          /* Voter Interface */
          <>
            {status === ElectionStatus.ACTIVE && (
              <button
                onClick={() => onVote(election)}
                className="flex-1 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg font-medium"
              >
                🗳️ Vote Now
              </button>
            )}
            {status === ElectionStatus.FINALIZED && (
              <button
                onClick={() => onViewResults(election)}
                className="flex-1 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg font-medium"
              >
                📊 View Results
              </button>
            )}
            {status === ElectionStatus.UPCOMING && (
              <button
                disabled
                className="flex-1 px-5 py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-xl cursor-not-allowed font-medium"
              >
                ⏰ Coming Soon
              </button>
            )}
            {status === ElectionStatus.ENDED && (
              <button
                disabled
                className="flex-1 px-5 py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-xl cursor-not-allowed font-medium"
              >
                🔒 Voting Closed
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

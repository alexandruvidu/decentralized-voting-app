'use client';

import { Election, ElectionStatus, getElectionStatus } from '@/types/election';

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
  
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusColor = (status: ElectionStatus) => {
    switch (status) {
      case ElectionStatus.UPCOMING:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case ElectionStatus.ACTIVE:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case ElectionStatus.ENDED:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case ElectionStatus.FINALIZED:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
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
    <div className="border rounded-lg p-6 hover:shadow-lg transition-shadow bg-white dark:bg-gray-800">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-semibold">{election.name}</h3>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status)}`}>
          {getStatusText(status)}
        </span>
      </div>
      
      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300 mb-4">
        <div>
          <span className="font-medium">Election ID:</span> {election.id}
        </div>
        <div>
          <span className="font-medium">Starts:</span> {formatDate(election.start_time)}
        </div>
        <div>
          <span className="font-medium">Ends:</span> {formatDate(election.end_time)}
        </div>
      </div>

      <div className="flex gap-2">
        {status === ElectionStatus.ACTIVE && (
          <>
            <button
              onClick={() => onVote(election)}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Vote
            </button>
            {onAddVoters && (
              <button
                onClick={() => onAddVoters(election)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
                title="Add eligible voters"
              >
                👥
              </button>
            )}
            {onForceEnd && (
              <button
                onClick={() => onForceEnd(election)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
                title="Force end election (testing)"
              >
                🛑
              </button>
            )}
          </>
        )}
        {status === ElectionStatus.ENDED && onFinalize && (
          <button
            onClick={() => onFinalize(election)}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          >
            Finalize
          </button>
        )}
        {status === ElectionStatus.FINALIZED && (
          <button
            onClick={() => onViewResults(election)}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          >
            View Results
          </button>
        )}
        {status === ElectionStatus.UPCOMING && (
          <>
            <button
              disabled
              className="flex-1 px-4 py-2 bg-gray-400 text-white rounded cursor-not-allowed"
            >
              Not Started
            </button>
            {onAddVoters && (
              <button
                onClick={() => onAddVoters(election)}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors text-sm"
                title="Add eligible voters"
              >
                👥 Add Voters
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

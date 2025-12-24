'use client';

import { Election } from '@/types/election';
import { useGetElectionResults } from '@/hooks/useElections';

interface ResultsModalProps {
  election: Election;
  onClose: () => void;
}

export function ResultsModal({ election, onClose }: ResultsModalProps) {
  const { results, loading } = useGetElectionResults(election.id);

  const sortedResults = [...results].sort((a, b) => b.votes - a.votes);
  const totalVotes = results.reduce((sum, r) => sum + r.votes, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Results: {election.name}</h2>
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
              <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Total Votes: <span className="font-bold text-lg">{totalVotes}</span>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Status: <span className={`font-medium ${election.is_finalized ? 'text-green-600' : 'text-yellow-600'}`}>
                    {election.is_finalized ? 'Finalized' : 'Preliminary'}
                  </span>
                </p>
              </div>

              <div className="space-y-4">
                {sortedResults.map((result, index) => {
                  const percentage = totalVotes > 0 ? (result.votes / totalVotes) * 100 : 0;
                  const isWinner = index === 0 && totalVotes > 0;

                  return (
                    <div
                      key={result.candidate}
                      className={`p-4 border rounded-lg ${
                        isWinner
                          ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          {isWinner && <span className="text-2xl">🏆</span>}
                          <span className="font-semibold text-lg">{result.candidate}</span>
                        </div>
                        <span className="text-xl font-bold">{result.votes}</span>
                      </div>
                      
                      <div className="relative w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isWinner
                              ? 'bg-yellow-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-gray-800 dark:text-white">
                          {percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!election.is_finalized && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ These are preliminary results. The election has not been finalized yet.
                  </p>
                </div>
              )}

              <div className="mt-6">
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { Election, ElectionStatus, getElectionStatus } from '@/types/election';
import { ElectionCard } from './ElectionCard';

interface ElectionListProps {
  elections: Election[];
  loading: boolean;
  onVote: (election: Election) => void;
  onViewResults: (election: Election) => void;
  onAddVoters?: (election: Election) => void;
  onEndElection?: (election: Election) => void;
  onPublishResults?: (electionId: number) => void;
}

export function ElectionList({ elections, loading, onVote, onViewResults, onAddVoters, onEndElection, onPublishResults }: ElectionListProps) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (elections.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No elections found. Create one to get started!
      </div>
    );
  }

  const activeElections = elections.filter(e => getElectionStatus(e) === ElectionStatus.ACTIVE);
  const upcomingElections = elections.filter(e => getElectionStatus(e) === ElectionStatus.UPCOMING);
  const pastElections = elections.filter(e => 
    getElectionStatus(e) === ElectionStatus.ENDED || getElectionStatus(e) === ElectionStatus.FINALIZED
  );

  return (
    <div className="space-y-8">
      {activeElections.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4 text-green-600 dark:text-green-400">Active Elections</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeElections.map((election) => (
              <ElectionCard
                key={election.id}
                election={election}
                onVote={onVote}
                onViewResults={onViewResults}
                onAddVoters={onAddVoters}
                onEndElection={onEndElection}
                onPublishResults={onPublishResults}
              />
            ))}
          </div>
        </section>
      )}

      {upcomingElections.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4 text-blue-600 dark:text-blue-400">Upcoming Elections</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingElections.map((election) => (
              <ElectionCard
                key={election.id}
                election={election}
                onVote={onVote}
                onViewResults={onViewResults}
                onAddVoters={onAddVoters}
                onEndElection={onEndElection}
                onPublishResults={onPublishResults}
              />
            ))}
          </div>
        </section>
      )}

      {pastElections.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4 text-gray-600 dark:text-gray-400">Past Elections</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastElections.map((election) => (
              <ElectionCard
                key={election.id}
                election={election}
                onVote={onVote}
                onViewResults={onViewResults}
                onAddVoters={onAddVoters}
                onEndElection={onEndElection}
                onPublishResults={onPublishResults}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

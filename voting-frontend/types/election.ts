export interface Election {
  id: number;
  name: string;
  start_time: number;
  end_time: number;
  is_finalized: boolean;
}

export interface ElectionResult {
  candidate: string;
  votes: number;
}

export enum ElectionStatus {
  UPCOMING = 'upcoming',
  ACTIVE = 'active',
  ENDED = 'ended',
  FINALIZED = 'finalized'
}

export function getElectionStatus(election: Election): ElectionStatus {
  const now = Math.floor(Date.now() / 1000);
  
  if (election.is_finalized) {
    return ElectionStatus.FINALIZED;
  }
  
  if (now < election.start_time) {
    return ElectionStatus.UPCOMING;
  }
  
  if (now > election.end_time) {
    return ElectionStatus.ENDED;
  }
  
  return ElectionStatus.ACTIVE;
}

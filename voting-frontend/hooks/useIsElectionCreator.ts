import { useEffect, useState } from 'react';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';

export function useIsElectionCreator(electionId: number | null) {
  const { address } = useGetAccountInfo();
  const [isCreator, setIsCreator] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || electionId === null) {
      setIsCreator(false);
      return;
    }

    // This hook is deprecated - we don't have a creator check in the current design
    // Elections are created by any caller and managed by the organizer
    setLoading(false);
    setIsCreator(false);
  }, [address, electionId]);

  return { isCreator, loading };
}

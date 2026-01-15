import { useEffect, useState } from 'react';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { contractAddress } from '@/config';
import { AbiRegistry, Address, SmartContractQueriesController } from '@multiversx/sdk-core';
import votingAppAbi from '@/contracts/voting-app.abi.json';

export function useIsElectionCreator(electionId: number | null) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [isCreator, setIsCreator] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || electionId === null) {
      setIsCreator(null);
      return;
    }

    const checkCreator = async () => {
      try {
        setLoading(true);
        const abi = AbiRegistry.create(votingAppAbi);
        const controller = new SmartContractQueriesController({
          metaChainUrl: network.apiAddress,
        });

        // Encode election ID as u64 BigInt
        const electionIdBuffer = Buffer.alloc(8);
        electionIdBuffer.writeBigUInt64BE(BigInt(electionId));

        const queryResponse = await controller.queryContract({
          contract: new Address(contractAddress),
          function: 'isElectionCreator',
          args: [electionIdBuffer],
          abi,
        });

        console.log('isElectionCreator query response:', queryResponse, 'for election:', electionId, 'address:', address);

        // Parse the boolean result
        const resultBuffer = queryResponse.firstSmartContractResult;
        const result = resultBuffer.length > 0 && resultBuffer[0] === 1;
        console.log('isCreator result:', result);
        setIsCreator(result);
      } catch (error) {
        console.error('Error checking election creator:', error);
        setIsCreator(false);
      } finally {
        setLoading(false);
      }
    };

    checkCreator();
  }, [address, electionId, network.apiAddress]);

  return { isCreator, loading };
}

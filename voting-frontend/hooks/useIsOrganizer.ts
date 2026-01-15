import { useEffect, useState } from 'react';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { contractAddress } from '@/config';

export function useIsOrganizer() {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [isOrganizer, setIsOrganizer] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setIsOrganizer(false);
      setLoading(false);
      return;
    }

    const checkOrganizer = async () => {
      try {
        setLoading(true);
        
        // Direct API query using the vm-values endpoint
        const queryUrl = `${network.apiAddress}/vm-values/query`;
        const response = await fetch(queryUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scAddress: contractAddress,
            funcName: 'isOrganizer',
            caller: address,
            args: [],
          }),
        });

        const data = await response.json();
        console.log('isOrganizer API response:', data);

        // Check if query succeeded and parse the boolean result
        if (data.data?.data?.returnData && data.data.data.returnData.length > 0) {
          const resultBase64 = data.data.data.returnData[0];
          const resultBuffer = Buffer.from(resultBase64, 'base64');
          console.log('Result buffer:', resultBuffer, 'hex:', resultBuffer.toString('hex'), 'length:', resultBuffer.length);
          const result = resultBuffer.length > 0 && resultBuffer[0] === 1;
          console.log('isOrganizer result:', result, 'for address:', address);
          setIsOrganizer(result);
        } else if (data.data?.data?.returnCode === 'ok') {
          // Try alternate response format
          console.log('Alternate format - returnCode ok, checking returnData');
          if (data.data.data.returnData && data.data.data.returnData.length > 0) {
            const resultBase64 = data.data.data.returnData[0];
            const result = resultBase64 === 'AQ=='; // Base64 for byte 0x01 (true)
            console.log('isOrganizer result (alternate):', result);
            setIsOrganizer(result);
          } else {
            setIsOrganizer(false);
          }
        } else {
          console.log('No return data, defaulting to false');
          setIsOrganizer(false);
        }
      } catch (error) {
        console.error('Error checking organizer:', error);
        setIsOrganizer(false);
      } finally {
        setLoading(false);
      }
    };

    checkOrganizer();
  }, [address, network.apiAddress]);

  return { isOrganizer, loading };
}

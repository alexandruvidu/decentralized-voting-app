'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  AbiRegistry, 
  Address,
  BytesValue,
  SmartContractTransactionsFactory, 
  TransactionsFactoryConfig,
  U64Value
} from '@multiversx/sdk-core';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';
import { contractAddress } from '@/config';
import votingAppAbi from '@/contracts/voting-app.abi.json';

export default function StoreKeyPage() {
  const searchParams = useSearchParams();
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [status, setStatus] = useState('Preparing transaction...');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const electionId = searchParams.get('electionId');
    const publicKey = searchParams.get('publicKey');

    if (!electionId || !publicKey) {
      setError('Missing electionId or publicKey parameters');
      return;
    }

    if (!address) {
      setStatus('Please connect your wallet to continue');
      return;
    }

    // Auto-submit the transaction
    storeKey(parseInt(electionId), publicKey);
  }, [address, searchParams]);

  async function storeKey(electionId: number, publicKeyHex: string) {
    try {
      setStatus('Creating transaction to store encryption keys...');
      
      const abi = AbiRegistry.create(votingAppAbi);
      const factory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      const transaction = await factory.createTransactionForExecute(
        new Address(address),
        {
          contract: new Address(contractAddress),
          function: 'setEncryptionPublicKey',
          gasLimit: BigInt(15_000_000),
          arguments: [
            new U64Value(electionId),
            BytesValue.fromHex(publicKeyHex)
          ]
        }
      );

      setStatus('Please sign the transaction in your wallet...');

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Storing encryption keys on blockchain...',
          errorMessage: 'Failed to store keys',
          successMessage: 'Encryption keys stored successfully!'
        }
      });

      setSuccess(true);
      setStatus('✅ Encryption keys successfully stored on blockchain!');
      
      // Redirect back to elections page after 3 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 3000);

         function hexToBytes(hex: string): Uint8Array {
           const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
           const bytes = new Uint8Array(clean.length / 2);
           for (let i = 0; i < bytes.length; i++) {
             bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
           }
           return bytes;
         }
    } catch (err) {
      console.error('Error storing key:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Store Encryption Keys
        </h1>

        {!address && (
          <div className="text-center">
            <p className="text-yellow-600 dark:text-yellow-400 mb-4">
              ⚠️ Please connect your wallet to continue
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Click "Connect" in the top right corner
            </p>
          </div>
        )}

        {address && !success && !error && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-700 dark:text-gray-300">{status}</p>
          </div>
        )}

        {success && (
          <div className="text-center">
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <p className="text-gray-700 dark:text-gray-300 mb-2">{status}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Redirecting to elections page...
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4">
            <p className="text-red-800 dark:text-red-200 font-semibold mb-2">Error</p>
                    hexToBytes(publicKeyHex)
            <button
              onClick={() => window.location.href = '/'}
              className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded w-full"
            >
              Return to Elections
            </button>
          </div>
        )}

        <div className="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
          <p>Election ID: {searchParams.get('electionId')}</p>
          <p className="mt-1">This will store the DKG encryption keys on the smart contract</p>
        </div>
      </div>
    </div>
  );
}

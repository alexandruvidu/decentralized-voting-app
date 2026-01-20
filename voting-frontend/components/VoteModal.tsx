'use client';

import { useState, useEffect } from 'react';
import { Buffer } from 'buffer';
import { 
  AbiRegistry, 
  Address, 
  SmartContractTransactionsFactory, 
  TransactionsFactoryConfig 
} from '@multiversx/sdk-core';
import { useGetAccountInfo } from '@multiversx/sdk-dapp/out/react/account/useGetAccountInfo';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { contractAddress } from '@/config';
import { Election } from '@/types/election';
import { useGetElectionResults } from '@/hooks/useElections';
import votingAppAbi from '@/contracts/voting-app.abi.json';
import { signAndSendTransactions } from '@/helpers/signAndSendTransactions';

// Local DKG/encryption service
const DKG_SERVICE_URL = '/dkg-api';
// const DKG_SERVICE_URL = 'http://localhost:3003';

interface VoteModalProps {
  election: Election;
  onClose: () => void;
  onSuccess: () => void;
}

export function VoteModal({ election, onClose, onSuccess }: VoteModalProps) {
  const { address } = useGetAccountInfo();
  const { network } = useGetNetworkConfig();
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [encryptionStatus, setEncryptionStatus] = useState<string>('');
  const [publicKeyHex, setPublicKeyHex] = useState<string | null>(null);
  const [publicKeyPGH, setPublicKeyPGH] = useState<{ p: string; g: string; h: string } | null>(null);
  const { results, loading } = useGetElectionResults(election.id);

  const candidates = results.map(r => r.candidate);

  // If the election object already has the key (from getAllElections), trust it first
  useEffect(() => {
    if (election.encryption_public_key && election.encryption_public_key.length > 0) {
      setPublicKeyHex(election.encryption_public_key);
      setEncryptionStatus('');
    }
  }, [election.encryption_public_key]);

  // Try to fetch full p,g,h from DKG service (if running) so encryption service gets all params
  useEffect(() => {
    async function fetchPGH() {
      try {
        const resp = await fetch(`${DKG_SERVICE_URL}/dkg/public-key/${election.id}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data?.publicKey?.p && data?.publicKey?.g && data?.publicKey?.h) {
          setPublicKeyPGH({ p: data.publicKey.p, g: data.publicKey.g, h: data.publicKey.h });
          // If we didn't already set h from chain, set it now
          if (!publicKeyHex && data.publicKey.h) {
            setPublicKeyHex(data.publicKey.h.startsWith('0x') ? data.publicKey.h.slice(2) : data.publicKey.h);
          }
        }
      } catch (_) {
        // Ignore if DKG service not reachable
      }
    }

    fetchPGH();
  }, [election.id, publicKeyHex]);

  // Fetch election public key from contract on mount
  useEffect(() => {
    async function fetchPublicKey() {
      try {
        const response = await fetch(
          `https://devnet-gateway.multiversx.com/vm-values/query`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scAddress: contractAddress,
              funcName: 'getEncryptionPublicKey',
              args: [election.id.toString()]
            })
          }
        );

        const data = await response.json();
        
        if (data.data?.data?.returnData && data.data.data.returnData.length > 0) {
          try {
            const returnData = data.data.data.returnData[0];
            
            // Check if it's null (no encryption key set)
            if (returnData === '' || returnData === '00') {
              console.warn('⚠️ No encryption key available for election', election.id);
              setEncryptionStatus('⚠️ Encryption keys not set yet');
              return;
            }

            // Detect encoding: gateway often returns base64, mxpy returns hex
            const isHex = /^[0-9a-fA-F]+$/.test(returnData);
            const buffer = isHex ? Buffer.from(returnData, 'hex') : Buffer.from(returnData, 'base64');

            let offset = 0;
            
            // Read the Option flag (1 byte): 1 = Some, 0 = None
            const hasKey = buffer[offset++];
            
            if (hasKey === 0) {
              console.warn('⚠️ No encryption key available for election', election.id);
              setEncryptionStatus('⚠️ Encryption keys not set yet');
              return;
            }
            
            // Read the key length (4 bytes)
            const keyLen = buffer.readUInt32BE(offset);
            offset += 4;
            
            // Extract the key bytes
            const publicKeyBytes = buffer.slice(offset, offset + keyLen);
            const keyHex = publicKeyBytes.toString('hex');
            
            if (keyHex && keyHex.length > 0) {
              setPublicKeyHex(keyHex);
              console.log('✅ Fetched encryption public key for election', election.id);
              console.log('   Key length:', keyHex.length, 'hex chars');
              setEncryptionStatus('');
              return;
            }
          } catch (parseError) {
            console.error('Error parsing encryption key:', parseError, { returnData: data.data.data.returnData });
            setEncryptionStatus('⚠️ Could not parse encryption key');
          }
        } else {
          console.warn('⚠️ No encryption key found for election', election.id);
          setEncryptionStatus('⚠️ Encryption keys not set yet');
        }
      } catch (error) {
        console.error('Error fetching public key:', error);
        setEncryptionStatus('⚠️ Could not fetch encryption key');
      }
    }
    
    // Skip fetch if we already have a key from the election object
    if (!publicKeyHex) {
      fetchPublicKey();
    }
  }, [election.id, publicKeyHex]);

  const handleVote = async () => {
    if (!selectedCandidate) {
      alert('Please select a candidate');
      return;
    }

    setIsSubmitting(true);
    setEncryptionStatus('Preparing vote...');

    try {
      // Merkle elections may not have encryption keys initially
      // But for now we'll require them for both types
      const keyToUse = (publicKeyPGH?.h || publicKeyHex || '').trim();
      if (!keyToUse) {
        alert('⚠️ Encryption keys not available. Please ensure the election organizer has generated encryption keys via the DKG service.');
        setIsSubmitting(false);
        return;
      }

      const normalizeHex = (hex: string) => {
        let s = hex.startsWith('0x') ? hex.slice(2) : hex;
        if (s.length % 2 !== 0) {
          s = '0' + s; // ensure even length
        }
        return s.toLowerCase();
      };

      const publicKeyHexNormalized = normalizeHex(keyToUse);
      const publicKeyHexWith0x = publicKeyHexNormalized.startsWith('0x') ? publicKeyHexNormalized : `0x${publicKeyHexNormalized}`;

      setEncryptionStatus('🔐 Encrypting vote with ElGamal...');
      console.log('Sending to encryption service for candidate:', selectedCandidate);
      console.log('Using public key length (hex chars):', publicKeyHexNormalized.length);
      if (publicKeyPGH) {
        console.log('PGH present (p,g,h lengths):', publicKeyPGH.p.length, publicKeyPGH.g.length, publicKeyPGH.h.length);
      }
      
      // Call local encryption service (port 3004)
      const encryptPayload: Record<string, any> = {
        publicKeyHex: publicKeyHexWith0x,
        candidateName: selectedCandidate
      };

      // If DKG p/g/h available, send them alongside
      if (publicKeyPGH) {
        encryptPayload.p = publicKeyPGH.p;
        encryptPayload.g = publicKeyPGH.g;
        encryptPayload.h = publicKeyPGH.h;
      }

      console.log('Encryption payload (sanitized):', {
        candidateName: selectedCandidate,
        publicKeyHexLen: encryptPayload.publicKeyHex.length,
        hasPGH: !!publicKeyPGH
      });

      const encryptServiceUrl = process.env.NEXT_PUBLIC_CRYPTO_SERVICE_URL
        || process.env.NEXT_PUBLIC_ENCRYPTION_SERVICE_URL
        || '/crypto-api';

      const encryptResponse = await fetch(`${encryptServiceUrl}/api/encrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encryptPayload)
      });

      if (!encryptResponse.ok) {
        const text = await encryptResponse.text();
        let parsed: any = {};
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          // leave parsed empty
        }
        console.error('Encryption service error response:', { status: encryptResponse.status, parsed, raw: text.slice(0, 500) });
        throw new Error(`Encryption service error (status ${encryptResponse.status}): ${parsed.error || text || 'Unknown error'}`);
      }

      const { encryptedBallot: encryptedBallotHex, encryptionTimeMs, keySizeBits } = await encryptResponse.json();
      console.log(`✅ Vote encrypted in ${encryptionTimeMs}ms with ${keySizeBits}-bit key`);
      
      const encryptedBallot = Buffer.from(encryptedBallotHex, 'hex');

      // Create transaction for encrypted vote (non-Merkle path)
      setEncryptionStatus('📡 Submitting to blockchain...');
      console.log('Submitting encrypted ballot to contract...');
      
      const abi = AbiRegistry.create(votingAppAbi);
      const scFactory = new SmartContractTransactionsFactory({
        config: new TransactionsFactoryConfig({ chainID: network.chainId }),
        abi
      });

      const transaction = await scFactory.createTransactionForExecute(
        new Address(address),
        {
          contract: new Address(contractAddress),
          function: 'vote',
          gasLimit: BigInt(15_000_000),
          arguments: [election.id, encryptedBallot]
        }
      );

      await signAndSendTransactions({
        transactions: [transaction],
        transactionsDisplayInfo: {
          processingMessage: 'Submitting encrypted vote...',
          errorMessage: 'Error submitting vote',
          successMessage: 'Vote submitted successfully!'
        }
      });

      setEncryptionStatus('✅ Vote submitted successfully!');
      alert('🔐 Your vote was encrypted with ElGamal homomorphic encryption and submitted to the blockchain.');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error voting:', error);
      setEncryptionStatus('❌ Error submitting vote');
      alert(`Failed to submit vote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Vote in {election.name}</h2>
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
              {/* Encryption Status Banner */}
              {publicKeyHex ? (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    🔐 <strong>Homomorphic encryption enabled.</strong> Your vote will be encrypted.
                  </p>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ <strong>Encryption keys not available.</strong> Vote will be stored as-is.
                  </p>
                </div>
              )}

              {/* Encryption Status During Submission */}
              {encryptionStatus && isSubmitting && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {encryptionStatus}
                  </p>
                </div>
              )}

              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Select your candidate below. You can only vote once.
                </p>
                
                <div className="space-y-2">
                  {candidates.map((candidate) => (
                    <label
                      key={candidate}
                      className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedCandidate === candidate
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="candidate"
                        value={candidate}
                        checked={selectedCandidate === candidate}
                        onChange={(e) => setSelectedCandidate(e.target.value)}
                        className="mr-3"
                      />
                      <span className="font-medium">{candidate}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleVote}
                  disabled={isSubmitting || !selectedCandidate || !publicKeyHex}
                  title={!publicKeyHex ? "Encryption keys must be generated first" : ""}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Vote'}
                </button>
              </div>

              {/* Privacy Notice */}
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  🔐 Privacy:
                </p>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {publicKeyHex ? (
                    <>
                      <li>✅ Vote encrypted with homomorphic encryption</li>
                      <li>✅ Individual votes hidden during tally</li>
                      <li>✅ Only aggregate results revealed</li>
                    </>
                  ) : (
                    <>
                      <li>⚠️ Encryption unavailable</li>
                      <li>ℹ️ Vote stored without encryption</li>
                    </>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

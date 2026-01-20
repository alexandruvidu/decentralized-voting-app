'use client';

import { useState, useEffect } from 'react';
import { ProxyNetworkProvider, Address, AbiRegistry, SmartContractController } from '@multiversx/sdk-core';
import { useGetNetworkConfig } from '@multiversx/sdk-dapp/out/react/network/useGetNetworkConfig';
import { contractAddress } from '@/config';
import votingAppAbi from '@/contracts/voting-app.abi.json';
import { Election, ElectionResult } from '@/types/election';

export function useGetAllElections() {
  const { network } = useGetNetworkConfig();
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchElections = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const provider = new ProxyNetworkProvider(network.apiAddress);
      const abiRegistry = AbiRegistry.create(votingAppAbi);
      
      const controller = new SmartContractController({
        chainID: network.chainId,
        networkProvider: provider,
        abi: abiRegistry as any
      });

      const query = controller.createQuery({
        contract: new Address(contractAddress),
        function: 'getAllElections',
        arguments: []
      });

      const response = await controller.runQuery(query);
      const parsed = controller.parseQueryResponse(response);
      
      const electionsList = parsed[0] || [];
      
      const mappedElections: Election[] = electionsList.map((e: any) => {
        const keyHex = e.encryption_public_key ? e.encryption_public_key.toString() : '';
        const hasKey = !!(keyHex && keyHex.length > 0);

        return {
          id: e.id.toNumber(),
          name: e.name.toString(),
          start_time: e.start_time.toNumber(),
          end_time: e.end_time.toNumber(),
          is_finalized: e.is_finalized,
          candidates: e.candidates ? e.candidates.map((c: any) => c.toString()) : [],
          has_encryption_key: hasKey,
          encryption_public_key: hasKey ? keyHex : undefined
        };
      });

      // Sort by ID descending (newest first)
      mappedElections.sort((a, b) => b.id - a.id);
      setElections(mappedElections);
    } catch (err) {
      console.error('Error fetching elections:', err);
      setError('Failed to fetch elections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (network.apiAddress) {
      fetchElections();
    }
  }, [network.apiAddress]);

  // Optimistically mark an election as ended in local state
  const markEnded = (electionId: number) => {
    const now = Math.floor(Date.now() / 1000);
    setElections(prev => prev.map(e => (
      // Set end_time to one second in the past to ensure ENDED status immediately
      e.id === electionId ? { ...e, end_time: now - 1 } : e
    )));
  };

  return { elections, loading, error, refetch: fetchElections, markEnded };
}

export function useGetElectionResults(electionId: number | null) {
  const { network } = useGetNetworkConfig();
  const [results, setResults] = useState<ElectionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = async () => {
    if (electionId === null) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const provider = new ProxyNetworkProvider(network.apiAddress);
      const abiRegistry = AbiRegistry.create(votingAppAbi);
      
      const controller = new SmartContractController({
        chainID: network.chainId,
        networkProvider: provider,
        abi: abiRegistry as any
      });

      const query = controller.createQuery({
        contract: new Address(contractAddress),
        function: 'getElectionResults',
        arguments: [electionId]
      });

      const response = await controller.runQuery(query);
      const parsed = controller.parseQueryResponse(response);
      
      console.log('Parsed results:', parsed);
      const resultsList = parsed[0] || [];
      console.log('Results list raw:', resultsList);
      console.log('Results list length:', resultsList.length);
      
      // Log each tuple for debugging
      resultsList.forEach((tuple: any, idx: number) => {
        const cand = tuple.field0 ? tuple.field0.toString() : (tuple[0] ? tuple[0].toString() : '');
        const vts = tuple.field1 ? Number(tuple.field1) : (tuple[1] ? Number(tuple[1]) : 0);
        console.log(`  [${idx}] candidate: "${cand}" (length: ${cand.length}), votes: ${vts}`);
      });
      
      const mappedResults: ElectionResult[] = resultsList
        .map((tuple: any) => {
          // tuple is [candidate, votes]
          let candidate = tuple.field0 ? tuple.field0.toString() : (tuple[0] ? tuple[0].toString() : '');
          const votes = tuple.field1 ? Number(tuple.field1) : (tuple[1] ? Number(tuple[1]) : 0);
          
          // Check for control characters or bad data patterns
          const hasBadCharacters = candidate.split('').some(char => {
            const code = char.charCodeAt(0);
            // Reject null bytes and most control characters
            return code < 32;
          });
          
          if (hasBadCharacters) {
            console.log(`  Filtered out due to control characters: "${candidate}"`);
            return null;
          }
          
          // Clean: trim whitespace
          candidate = candidate.trim();
          
          // Reject empty, very long (>100), or likely garbage
          if (!candidate || candidate.length === 0 || candidate.length > 100) {
            console.log(`  Filtered out due to length: "${candidate}" (length: ${candidate.length})`);
            return null;
          }
          
          return {
            candidate,
            votes
          };
        })
        .filter((result): result is ElectionResult => {
          return result !== null && result.candidate.length > 0;
        });
      
      console.log('Final mapped results:', mappedResults);
      setResults(mappedResults);
    } catch (err) {
      console.error('Error fetching results:', err);
      setError('Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (network.apiAddress) {
      fetchResults();
    }
  }, [electionId, network.apiAddress]);

  return { results, loading, error, refetch: fetchResults };
}


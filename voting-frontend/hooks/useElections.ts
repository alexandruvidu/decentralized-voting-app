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
      
      const mappedElections: Election[] = electionsList.map((e: any) => ({
        id: e.id.toNumber(),
        name: e.name.toString(),
        start_time: e.start_time.toNumber(),
        end_time: e.end_time.toNumber(),
        is_finalized: e.is_finalized
      }));

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

  return { elections, loading, error, refetch: fetchElections };
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
      console.log('Results list:', resultsList);
      
      const mappedResults: ElectionResult[] = resultsList.map((tuple: any) => {
        // tuple is [candidate, votes]
        const candidate = tuple.field0 ? tuple.field0.toString() : (tuple[0] ? tuple[0].toString() : '');
        const votes = tuple.field1 ? Number(tuple.field1) : (tuple[1] ? Number(tuple[1]) : 0);
        
        return {
          candidate,
          votes
        };
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


#![no_std]

#[allow(unused_imports)]
use multiversx_sc::imports::*;
use multiversx_sc::derive_imports::*;

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, ManagedVecItem)]
pub struct ElectionInfo<M: ManagedTypeApi> {
    pub id: u64,
    pub name: ManagedBuffer<M>,
    pub start_time: u64,
    pub end_time: u64,
    pub is_finalized: bool,
    pub merkle_root: Option<ManagedBuffer<M>>,  // For Merkle tree voting
}

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode)]
pub enum VotingMode {
    DirectVoting,      // Traditional: all voters stored
    MerkleProof,       // Scalable: voters provide Merkle proof
}

/// A decentralized voting smart contract with multiple elections and eligible voters.
#[multiversx_sc::contract]
pub trait VotingApp {
    #[init]
    fn init(&self) {
        let caller = self.blockchain().get_caller();
        self.organizer().set(caller);
    }

    #[upgrade]
    fn upgrade(&self) {}

    #[endpoint(createElection)]
    fn create_election(
        &self,
        name: ManagedBuffer,
        start_time: u64,
        end_time: u64,
        candidates: MultiValueEncoded<ManagedBuffer>,
    ) -> u64 {
        self.require_organizer();
        require!(!name.is_empty(), "Election name cannot be empty");
        require!(start_time < end_time, "Start time must be before end time");
        
        let current_timestamp = self.blockchain().get_block_timestamp();
        require!(start_time >= current_timestamp, "Election start time cannot be in the past");

        let election_id = self.last_election_id().get() + 1;
        self.last_election_id().set(election_id);

        let election_info = ElectionInfo {
            id: election_id,
            name,
            start_time,
            end_time,
            is_finalized: false,
            merkle_root: None,
        };
        self.election_info(election_id).set(election_info);

        for candidate in candidates {
            self.candidates(election_id).insert(candidate);
        }

        election_id
    }

    #[endpoint(createElectionWithMerkle)]
    fn create_election_with_merkle(
        &self,
        name: ManagedBuffer,
        start_time: u64,
        end_time: u64,
        merkle_root: ManagedBuffer,
        candidates: MultiValueEncoded<ManagedBuffer>,
    ) -> u64 {
        // Temporarily disabled while testing small voter sets without Merkle proofs.
        require!(false, "Merkle voting is disabled for now");
        0

        // self.require_organizer();
        // require!(!name.is_empty(), "Election name cannot be empty");
        // require!(start_time < end_time, "Start time must be before end time");
        // require!(merkle_root.len() == 32, "Merkle root must be 32 bytes (SHA256)");
        //
        // let election_id = self.last_election_id().get() + 1;
        // self.last_election_id().set(election_id);
        //
        // let election_info = ElectionInfo {
        //     id: election_id,
        //     name,
        //     start_time,
        //     end_time,
        //     is_finalized: false,
        //     merkle_root: Some(merkle_root),
        // };
        // self.election_info(election_id).set(election_info);
        //
        // for candidate in candidates {
        //     self.candidates(election_id).insert(candidate);
        // }
        //
        // election_id
    }

    #[endpoint(addVoters)]
    fn add_voters(&self, election_id: u64, voters: MultiValueEncoded<ManagedAddress>) {
        self.require_organizer();
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        // Allow adding voters anytime before it ends? Or only before start?
        // Usually before start or during active is fine.
        let info = self.election_info(election_id).get();
        require!(!info.is_finalized, "Election ended");

        for voter in voters {
            self.eligible_voters(election_id).insert(voter);
        }
    }

    #[endpoint(endElection)]
    fn end_election(&self, election_id: u64) {
        self.require_organizer();
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let mut info = self.election_info(election_id).get();
        require!(!info.is_finalized, "Election already finalized");
        
        let current_timestamp = self.blockchain().get_block_timestamp();
        require!(current_timestamp > info.end_time, "Election not yet ended");

        info.is_finalized = true;
        self.election_info(election_id).set(info);

        // Calculate and store results
        let mut candidates_vec = ManagedVec::new();
        let mut counts_vec = ManagedVec::new();
        for candidate in self.candidates(election_id).iter() {
            let count = self.vote_counts(election_id, &candidate).get();
            candidates_vec.push(candidate);
            counts_vec.push(count);
        }
        self.final_candidates(election_id).set(candidates_vec);
        self.final_counts(election_id).set(counts_vec);
    }

    #[endpoint(forceEndElection)]
    fn force_end_election(&self, election_id: u64) {
        self.require_organizer();
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let mut info = self.election_info(election_id).get();
        require!(!info.is_finalized, "Election already finalized");
        
        // No time check - allow ending at any time for testing

        info.is_finalized = true;
        self.election_info(election_id).set(info);

        // Calculate and store results
        let mut candidates_vec = ManagedVec::new();
        let mut counts_vec = ManagedVec::new();
        for candidate in self.candidates(election_id).iter() {
            let count = self.vote_counts(election_id, &candidate).get();
            candidates_vec.push(candidate);
            counts_vec.push(count);
        }
        self.final_candidates(election_id).set(candidates_vec);
        self.final_counts(election_id).set(counts_vec);
    }

    #[endpoint]
    fn vote(&self, election_id: u64, candidate: ManagedBuffer) {
        let caller = self.blockchain().get_caller();
        
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let info = self.election_info(election_id).get();
        let current_timestamp = self.blockchain().get_block_timestamp();

        require!(current_timestamp >= info.start_time, "Election not started");
        require!(current_timestamp <= info.end_time, "Election ended");
        require!(!info.is_finalized, "Election finalized");

        require!(self.eligible_voters(election_id).contains(&caller), "Not eligible to vote");
        require!(!self.has_voted(election_id).contains(&caller), "Already voted");
        require!(self.candidates(election_id).contains(&candidate), "Invalid candidate");

        self.has_voted(election_id).insert(caller);
        self.vote_counts(election_id, &candidate).update(|count| *count += 1);
    }

    #[endpoint(voteWithMerkleProof)]
    fn vote_with_merkle_proof(
        &self,
        _election_id: u64,
        _candidate: ManagedBuffer,
        _merkle_proof: MultiValueEncoded<ManagedBuffer>,
    ) {
        // Temporarily disabled while testing small voter sets without Merkle proofs.
        require!(false, "Merkle voting is disabled for now");

        // let caller = self.blockchain().get_caller();
        // 
        // require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        // 
        // let info = self.election_info(election_id).get();
        // let current_timestamp = self.blockchain().get_block_timestamp();
        //
        // require!(current_timestamp >= info.start_time, "Election not started");
        // require!(current_timestamp <= info.end_time, "Election ended");
        // require!(!info.is_finalized, "Election finalized");
        // require!(!self.has_voted(election_id).contains(&caller), "Already voted");
        // require!(self.candidates(election_id).contains(&candidate), "Invalid candidate");
        //
        // // Verify Merkle proof
        // require!(info.merkle_root.is_some(), "This election does not use Merkle proof voting");
        // let merkle_root = info.merkle_root.unwrap();
        // 
        // let is_valid = self.verify_merkle_proof(&caller, &merkle_root, &merkle_proof);
        // require!(is_valid, "Invalid Merkle proof - not an eligible voter");
        //
        // // Record vote
        // self.has_voted(election_id).insert(caller);
        // self.vote_counts(election_id, &candidate).update(|count| *count += 1);
    }

    #[view(verifyMerkleProof)]
    fn verify_merkle_proof(
        &self,
        voter: &ManagedAddress,
        merkle_root: &ManagedBuffer,
        proof: &MultiValueEncoded<ManagedBuffer>,
    ) -> bool {
        // Convert voter address to ManagedBuffer
        let voter_buffer = voter.as_managed_buffer().clone();
        
        // Hash the voter address - returns ManagedByteArray<M, 32>
        let voter_hash = self.crypto().keccak256(voter_buffer);
        
        // Convert to ManagedBuffer for easier manipulation
        let mut current_buffer = ManagedBuffer::new_from_bytes(&voter_hash.to_byte_array());

        // Apply each proof element
        for proof_element in proof.clone() {
            // Create combined buffer
            let mut combined = ManagedBuffer::new();
            combined.append(&current_buffer);
            combined.append(&proof_element);
            
            // Hash the combined data
            let hash_result = self.crypto().keccak256(combined);
            current_buffer = ManagedBuffer::new_from_bytes(&hash_result.to_byte_array());
        }

        // Compare final hash with stored root
        &current_buffer == merkle_root
    }

    #[view(getAllElections)]
    fn get_all_elections(&self) -> MultiValueEncoded<ElectionInfo<Self::Api>> {
        let mut result = MultiValueEncoded::new();
        let last_id = self.last_election_id().get();
        for id in 1..=last_id {
            let info = self.election_info(id).get();
            result.push(info);
        }
        result
    }

    #[view(getElectionResults)]
    fn get_election_results(&self, election_id: u64) -> MultiValueEncoded<(ManagedBuffer, u64)> {
        let info = self.election_info(election_id).get();
        
        if info.is_finalized {
             let candidates = self.final_candidates(election_id).get();
             let counts = self.final_counts(election_id).get();
             
             let mut output = MultiValueEncoded::new();
             let len = candidates.len();
             for i in 0..len {
                 let candidate = candidates.get(i);
                 let count = counts.get(i);
                 output.push((candidate.clone_value(), count));
             }
             return output;
        }

        let mut result = MultiValueEncoded::new();
        for candidate in self.candidates(election_id).iter() {
            let count = self.vote_counts(election_id, &candidate).get();
            result.push((candidate, count));
        }
        result
    }

    /// Returns only the candidate names for a given election.
    /// This avoids returning vote counts when the frontend only needs names.
    #[view(getElectionCandidates)]
    fn get_election_candidates(&self, election_id: u64) -> MultiValueEncoded<ManagedBuffer> {
        let info = self.election_info(election_id).get();

        // If finalized, return the stored final candidates
        if info.is_finalized {
            let candidates = self.final_candidates(election_id).get();
            let mut output = MultiValueEncoded::new();
            for candidate in candidates.into_iter() {
                output.push(candidate);
            }
            return output;
        }

        // Otherwise, return the live candidates set
        let mut result = MultiValueEncoded::new();
        for candidate in self.candidates(election_id).iter() {
            result.push(candidate);
        }
        result
    }

    fn require_organizer(&self) {
        let caller = self.blockchain().get_caller();
        require!(caller == self.organizer().get(), "Only organizer can call this");
    }

    #[storage_mapper("organizer")]
    fn organizer(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("lastElectionId")]
    fn last_election_id(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("electionInfo")]
    fn election_info(&self, id: u64) -> SingleValueMapper<ElectionInfo<Self::Api>>;

    #[storage_mapper("finalCandidates")]
    fn final_candidates(&self, id: u64) -> SingleValueMapper<ManagedVec<ManagedBuffer>>;

    #[storage_mapper("finalCounts")]
    fn final_counts(&self, id: u64) -> SingleValueMapper<ManagedVec<u64>>;

    #[storage_mapper("candidates")]
    fn candidates(&self, id: u64) -> SetMapper<ManagedBuffer>;

    #[storage_mapper("eligibleVoters")]
    fn eligible_voters(&self, id: u64) -> SetMapper<ManagedAddress>;

    #[storage_mapper("hasVoted")]
    fn has_voted(&self, id: u64) -> SetMapper<ManagedAddress>;

    #[storage_mapper("voteCounts")]
    fn vote_counts(&self, id: u64, candidate: &ManagedBuffer) -> SingleValueMapper<u64>;
}

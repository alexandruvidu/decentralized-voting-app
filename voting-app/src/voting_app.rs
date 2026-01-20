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
    pub candidates: ManagedVec<M, ManagedBuffer<M>>,
    pub merkle_root: Option<ManagedBuffer<M>>,
    pub encryption_public_key: Option<ManagedBuffer<M>>, // For threshold-encrypted voting
}

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode)]
pub enum VotingMode {
    DirectVoting,
    MerkleProof,
}

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
    #[allow_multiple_var_args]
    fn create_election(
        &self,
        name: ManagedBuffer,
        start_time: u64,
        end_time: u64,
        encryption_public_key: OptionalValue<ManagedBuffer>,
        candidates: MultiValueEncoded<ManagedBuffer>,
    ) -> u64 {
        self.require_organizer();
        require!(!name.is_empty(), "Election name cannot be empty");
        require!(start_time < end_time, "Start time must be before end time");
        
        let current_timestamp = self.blockchain().get_block_timestamp();
        require!(start_time >= current_timestamp, "Election start time cannot be in the past");

        let election_id = self.last_election_id().get() + 1;
        self.last_election_id().set(election_id);

        let pub_key = match encryption_public_key {
            OptionalValue::Some(key) => Some(key),
            OptionalValue::None => None,
        };

        let mut candidates_vec = ManagedVec::new();
        for candidate in candidates {
            self.candidates(election_id).insert(candidate.clone());
            candidates_vec.push(candidate);
        }

        let election_info = ElectionInfo {
            id: election_id,
            name,
            start_time,
            end_time,
            is_finalized: false,
            candidates: candidates_vec,
            merkle_root: None,
            encryption_public_key: pub_key,
        };
        self.election_info(election_id).set(election_info);

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
        self.require_organizer();
        require!(!name.is_empty(), "Election name cannot be empty");
        require!(start_time < end_time, "Start time must be before end time");
        require!(merkle_root.len() == 32, "Merkle root must be 32 bytes (keccak256)");

        let current_timestamp = self.blockchain().get_block_timestamp();
        require!(start_time >= current_timestamp, "Election start time cannot be in the past");

        let election_id = self.last_election_id().get() + 1;
        self.last_election_id().set(election_id);

        let mut candidates_vec = ManagedVec::new();
        for candidate in candidates {
            self.candidates(election_id).insert(candidate.clone());
            candidates_vec.push(candidate);
        }

        let election_info = ElectionInfo {
            id: election_id,
            name,
            start_time,
            end_time,
            is_finalized: false,
            candidates: candidates_vec,
            merkle_root: Some(merkle_root),
            encryption_public_key: None,
        };
        self.election_info(election_id).set(election_info);

        election_id
    }

    #[endpoint(setEncryptionPublicKey)]
    fn set_encryption_public_key(&self, election_id: u64, public_key: ManagedBuffer) {
        self.require_organizer();
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");

        let mut info = self.election_info(election_id).get();
        require!(!info.is_finalized, "Election already finalized");
        
        // Store the encryption public key (binary encoded: p || g || h)
        info.encryption_public_key = Some(public_key);
        self.election_info(election_id).set(info);
    }

    #[endpoint(addVoters)]
    fn add_voters(&self, election_id: u64, voters: MultiValueEncoded<ManagedAddress>) {
        self.require_organizer();
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");

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
        
        let info = self.election_info(election_id).get();
        require!(!info.is_finalized, "Election already finalized");
        
        let current_timestamp = self.blockchain().get_block_timestamp();
        require!(current_timestamp > info.end_time, "Election not yet ended");

        // Just end voting - do NOT finalize yet
        // Finalization happens only when results are published (after threshold decryption)
        // No state change needed - election naturally ends at end_time
    }

    #[endpoint(forceEndElection)]
    fn force_end_election(&self, election_id: u64) {
        self.require_organizer();
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        let mut info = self.election_info(election_id).get();
        require!(!info.is_finalized, "Election already finalized");

        let current_timestamp = self.blockchain().get_block_timestamp();
        // Prevent redundant force end calls
        require!(current_timestamp <= info.end_time, "Election already ended");

        // Force end voting immediately by updating end_time to slightly in the past
        // This ensures publish_results (which checks > end_time) works immediately
        info.end_time = current_timestamp.saturating_sub(1);
        self.election_info(election_id).set(&info);
    }

    #[endpoint(vote)]
    fn vote(&self, election_id: u64, encrypted_ballot: ManagedBuffer) {
        let caller = self.blockchain().get_caller();
        
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let info = self.election_info(election_id).get();
        let current_timestamp = self.blockchain().get_block_timestamp();

        require!(current_timestamp >= info.start_time, "Election not started");
        require!(current_timestamp <= info.end_time, "Election ended");
        require!(!info.is_finalized, "Election finalized");
        require!(info.encryption_public_key.is_some(), "Election encryption keys not set");

        require!(self.eligible_voters(election_id).contains(&caller), "Not eligible to vote");
        require!(!self.has_voted(election_id).contains(&caller), "Already voted");

        // Store the encrypted ballot (ElGamal ciphertext from client)
        self.encrypted_votes(election_id).insert(encrypted_ballot);
        
        // Record that this voter has voted
        self.has_voted(election_id).insert(caller);
    }

    /// Merkle-based, privacy-preserving voting (no on-chain whitelist)
    #[endpoint(voteWithMerkle)]
    fn vote_with_merkle(
        &self,
        election_id: u64,
        nullifier: ManagedBuffer,
        encrypted_ballot: ManagedBuffer,
        merkle_proof: MultiValueEncoded<ManagedBuffer>,
    ) {
        let caller = self.blockchain().get_caller();

        require!(!self.election_info(election_id).is_empty(), "Election does not exist");

        let info = self.election_info(election_id).get();
        let current_timestamp = self.blockchain().get_block_timestamp();

        require!(current_timestamp >= info.start_time, "Election not started");
        require!(current_timestamp <= info.end_time, "Election ended");
        require!(!info.is_finalized, "Election finalized");
        require!(info.encryption_public_key.is_some(), "Election encryption keys not set");
        require!(info.merkle_root.is_some(), "Election not configured for Merkle voting");

        // Nullifier prevents double voting without storing voter address
        require!(
            !self.used_nullifiers(election_id).contains(&nullifier),
            "Already voted",
        );

        // Verify Merkle membership of caller
        let leaf = self.hash_address(&caller);
        let is_valid = self.verify_merkle_proof_leaf(
            &leaf,
            &info.merkle_root.unwrap(),
            &merkle_proof,
        );
        require!(is_valid, "Invalid Merkle proof - not eligible");

        self.used_nullifiers(election_id).insert(nullifier);
        self.encrypted_votes(election_id).insert(encrypted_ballot);
    }

    #[endpoint(voteEncrypted)]
    fn vote_encrypted(&self, election_id: u64, encrypted_vote: ManagedBuffer, nonce: u64) {
        let caller = self.blockchain().get_caller();
        
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let info = self.election_info(election_id).get();
        let current_timestamp = self.blockchain().get_block_timestamp();

        require!(current_timestamp >= info.start_time, "Election not started");
        require!(current_timestamp <= info.end_time, "Election ended");
        require!(!info.is_finalized, "Election finalized");

        // Verify that this election has encryption enabled
        require!(info.encryption_public_key.is_some(), "This election does not use encrypted voting");
        
        // Replay protection: check if nonce has been used
        require!(!self.used_nonces(election_id).contains(&nonce), "Nonce already used - replay attack detected");
        self.used_nonces(election_id).insert(nonce);
        
        // For relayer-based voting, caller is the relayer
        // Relayer verifies eligibility and prevents duplicates off-chain
        // Store the encrypted vote (cannot be read without threshold decryption)
        self.encrypted_votes(election_id).insert(encrypted_vote);
    }

    #[view(verifyMerkleProof)]
    fn verify_merkle_proof(
        &self,
        voter: &ManagedAddress,
        merkle_root: &ManagedBuffer,
        proof: &MultiValueEncoded<ManagedBuffer>,
    ) -> bool {
        let leaf = self.hash_address(voter);
        self.verify_merkle_proof_leaf(&leaf, merkle_root, proof)
    }

    fn hash_address(&self, addr: &ManagedAddress) -> ManagedBuffer {
        let hash = self.crypto().keccak256(addr.as_managed_buffer());
        ManagedBuffer::new_from_bytes(&hash.to_byte_array())
    }

    fn verify_merkle_proof_leaf(
        &self,
        leaf: &ManagedBuffer,
        merkle_root: &ManagedBuffer,
        proof: &MultiValueEncoded<ManagedBuffer>,
    ) -> bool {
        let mut current_buffer = leaf.clone();

        for proof_element in proof.clone() {
            let mut combined = ManagedBuffer::new();
            combined.append(&current_buffer);
            combined.append(&proof_element);

            let hash_result = self.crypto().keccak256(combined);
            current_buffer = ManagedBuffer::new_from_bytes(&hash_result.to_byte_array());
        }

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

    #[view(isOrganizer)]
    fn is_organizer(&self) -> bool {
        let caller = self.blockchain().get_caller();
        caller == self.organizer().get()
    }

    #[view(getElectionResults)]
    fn get_election_results(&self, election_id: u64) -> MultiValueEncoded<(ManagedBuffer, u64)> {
        let info = self.election_info(election_id).get();
        
        // Only allow viewing results after election is finalized
        // This ensures votes remain private during and immediately after election
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

        // Before finalization, return empty results (votes are private)
        let mut result = MultiValueEncoded::new();
        for candidate in self.candidates(election_id).iter() {
            result.push((candidate, 0));
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

    /// Returns the encryption public key for an election (for encrypted voting)
    #[view(getEncryptionPublicKey)]
    fn get_encryption_public_key(&self, election_id: u64) -> Option<ManagedBuffer> {
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let info = self.election_info(election_id).get();
        info.encryption_public_key
    }

    /// Returns all eligible voters for an election (for Merkle tree proof generation)
    #[view(getEligibleVoters)]
    fn get_eligible_voters(&self, election_id: u64) -> MultiValueEncoded<ManagedAddress> {
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let mut result = MultiValueEncoded::new();
        for voter in self.eligible_voters(election_id).iter() {
            result.push(voter);
        }
        result
    }

    /// Returns all encrypted votes for an election (for threshold decryption)
    #[view(getEncryptedVotes)]
    fn get_encrypted_votes(&self, election_id: u64) -> MultiValueEncoded<ManagedBuffer> {
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let mut result = MultiValueEncoded::new();
        for vote in self.encrypted_votes(election_id).iter() {
            result.push(vote);
        }
        result
    }

    /// Organizer publishes decrypted results after threshold ceremony
    #[endpoint(publishResults)]
    fn publish_results(
        &self,
        election_id: u64,
        candidate_counts: MultiValueEncoded<MultiValue2<ManagedBuffer, u64>>,
    ) {
        self.require_organizer();
        
        require!(!self.election_info(election_id).is_empty(), "Election does not exist");
        
        let mut info = self.election_info(election_id).get();
        require!(!info.is_finalized, "Results already published");
        
        let current_timestamp = self.blockchain().get_block_timestamp();
        require!(current_timestamp > info.end_time, "Election still ongoing");

        // Store the results
        let mut candidates_vec = ManagedVec::new();
        let mut counts_vec = ManagedVec::new();
        
        for pair in candidate_counts {
            let (candidate, count) = pair.into_tuple();
            candidates_vec.push(candidate);
            counts_vec.push(count);
        }
        
        self.final_candidates(election_id).set(candidates_vec);
        self.final_counts(election_id).set(counts_vec);
        
        // Mark as finalized
        info.is_finalized = true;
        self.election_info(election_id).set(info);
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

    #[storage_mapper("privateVotes")]
    fn private_votes(&self, id: u64) -> SetMapper<ManagedBuffer>;

    #[storage_mapper("encryptedVotes")]
    fn encrypted_votes(&self, id: u64) -> SetMapper<ManagedBuffer>;

    #[storage_mapper("usedNonces")]
    fn used_nonces(&self, election_id: u64) -> SetMapper<u64>;

    #[storage_mapper("usedNullifiers")]
    fn used_nullifiers(&self, election_id: u64) -> SetMapper<ManagedBuffer>;

    #[storage_mapper("voteCounts")]
    fn vote_counts(&self, id: u64, candidate: &ManagedBuffer) -> SingleValueMapper<u64>;
}

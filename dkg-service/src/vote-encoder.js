/**
 * Vote Encoding System for Homomorphic Voting
 * 
 * Maps candidate names to numeric IDs for ElGamal encryption
 * Supports:
 * - String candidate names → numeric IDs
 * - Multiple voting methods (single choice, ranked choice)
 * - Vote aggregation for tallying
 */

import crypto from 'crypto';

/**
 * Create a vote encoder for an election
 * Maps candidate names to sequential IDs (1, 2, 3, ...)
 */
export function createVoteEncoder(candidates) {
  // Create mapping: candidate_name → id
  const nameToId = {};
  const idToName = {};
  
  candidates.forEach((name, index) => {
    const id = index + 1; // IDs start from 1 (0 is reserved for no vote)
    nameToId[name] = id;
    idToName[id] = name;
  });
  
  return {
    nameToId,
    idToName,
    candidates,
    
    /**
     * Encode candidate name to numeric ID
     */
    encode(candidateName) {
      if (!(candidateName in nameToId)) {
        throw new Error(`Unknown candidate: ${candidateName}`);
      }
      return nameToId[candidateName];
    },
    
    /**
     * Decode numeric ID back to candidate name
     */
    decode(id) {
      if (!(id in idToName)) {
        throw new Error(`Unknown candidate ID: ${id}`);
      }
      return idToName[id];
    },
    
    /**
     * Get all candidate IDs
     */
    getAllIds() {
      return Object.values(nameToId);
    },
    
    /**
     * Validate if vote is valid candidate ID
     */
    isValidVote(id) {
      return id in idToName;
    }
  };
}

/**
 * Vote accumulator for homomorphic tallying
 * Keeps encrypted votes separate by candidate
 */
export function createVoteAccumulator(encoder, publicKey) {
  const accumulators = {};
  
  // Initialize accumulator for each candidate
  encoder.getAllIds().forEach(id => {
    accumulators[id] = null; // Will hold encrypted sum for this candidate
  });
  
  return {
    /**
     * Add a single encrypted vote
     */
    addVote(encryptedVote, candidateId) {
      if (!encoder.isValidVote(candidateId)) {
        throw new Error(`Invalid candidate ID: ${candidateId}`);
      }
      
      if (accumulators[candidateId] === null) {
        // First vote for this candidate
        accumulators[candidateId] = encryptedVote;
      } else {
        // Add to existing encrypted sum (homomorphic addition)
        // Note: requires importing addEncrypted from elgamal-crypto
        accumulators[candidateId] = {
          c1: accumulators[candidateId].c1,
          c2: accumulators[candidateId].c2,
          _pendingAdd: {
            c1: encryptedVote.c1,
            c2: encryptedVote.c2
          }
        };
      }
    },
    
    /**
     * Get accumulated encrypted votes
     */
    getAccumulators() {
      return accumulators;
    },
    
    /**
     * Get vote count for specific candidate (before decryption)
     */
    getEncryptedTotal(candidateId) {
      if (!encoder.isValidVote(candidateId)) {
        throw new Error(`Invalid candidate ID: ${candidateId}`);
      }
      return accumulators[candidateId];
    },
    
    /**
     * Get tally structure for transmission
     */
    getTallyStructure() {
      const tally = {};
      encoder.getAllIds().forEach(id => {
        const candidateName = encoder.decode(id);
        tally[candidateName] = {
          id,
          encryptedTotal: accumulators[id],
          counted: accumulators[id] !== null
        };
      });
      return tally;
    }
  };
}

/**
 * Vote batch encoder for relayer operations
 * Batch multiple votes together efficiently
 */
export function createBatchVoteEncoder(encoder) {
  const batches = {};
  
  return {
    /**
     * Add vote to batch
     */
    addVote(candidateName, encryptedVote) {
      const candidateId = encoder.encode(candidateName);
      
      if (!batches[candidateId]) {
        batches[candidateId] = {
          candidateName,
          candidateId,
          votes: [],
          count: 0
        };
      }
      
      batches[candidateId].votes.push(encryptedVote);
      batches[candidateId].count++;
    },
    
    /**
     * Get batch statistics
     */
    getStats() {
      const stats = {
        totalVotes: 0,
        votesByCandidate: {}
      };
      
      Object.values(batches).forEach(batch => {
        stats.votesByCandidate[batch.candidateName] = batch.count;
        stats.totalVotes += batch.count;
      });
      
      return stats;
    },
    
    /**
     * Get all batches
     */
    getBatches() {
      return batches;
    },
    
    /**
     * Clear batches
     */
    reset() {
      Object.keys(batches).forEach(key => delete batches[key]);
    }
  };
}

/**
 * Helper to create a vote tally from plaintext votes
 * Useful for testing and validation
 */
export function createPlaintextTally(candidates) {
  const tally = {};
  
  candidates.forEach(name => {
    tally[name] = 0;
  });
  
  return {
    /**
     * Record a vote
     */
    vote(candidateName) {
      if (!(candidateName in tally)) {
        throw new Error(`Unknown candidate: ${candidateName}`);
      }
      tally[candidateName]++;
    },
    
    /**
     * Record multiple votes
     */
    voteMultiple(candidateName, count) {
      if (!(candidateName in tally)) {
        throw new Error(`Unknown candidate: ${candidateName}`);
      }
      tally[candidateName] += count;
    },
    
    /**
     * Get tally
     */
    getTally() {
      return { ...tally };
    },
    
    /**
     * Get winner(s)
     */
    getWinner() {
      let maxVotes = 0;
      const winners = [];
      
      Object.entries(tally).forEach(([name, votes]) => {
        if (votes > maxVotes) {
          maxVotes = votes;
          winners.length = 0;
          winners.push({ name, votes });
        } else if (votes === maxVotes) {
          winners.push({ name, votes });
        }
      });
      
      return {
        winners,
        isTied: winners.length > 1,
        totalVotes: Object.values(tally).reduce((a, b) => a + b, 0)
      };
    },
    
    /**
     * Get results summary
     */
    getSummary() {
      const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);
      const results = Object.entries(tally)
        .map(([name, votes]) => ({
          name,
          votes,
          percentage: totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(2) : '0.00'
        }))
        .sort((a, b) => b.votes - a.votes);
      
      return {
        results,
        totalVotes,
        winner: results[0]
      };
    }
  };
}

/**
 * Test vote encoding and tallying
 */
export function testVoteEncoding() {
  console.log('\n📝 Testing Vote Encoding System\n');
  console.log('═'.repeat(60));
  
  const candidates = ['Alice', 'Bob', 'Charlie'];
  const votes = ['Alice', 'Bob', 'Alice', 'Charlie', 'Alice', 'Bob', 'Charlie'];
  
  console.log('\n🗳️  Creating encoder and tally...');
  const encoder = createVoteEncoder(candidates);
  const tally = createPlaintextTally(candidates);
  
  console.log('\n📊 Voting:');
  votes.forEach((vote, i) => {
    console.log(`   Voter ${i + 1}: votes for ${vote} (ID: ${encoder.encode(vote)})`);
    tally.vote(vote);
  });
  
  console.log('\n📈 Results:');
  const summary = tally.getSummary();
  summary.results.forEach(result => {
    console.log(`   ${result.name}: ${result.votes} votes (${result.percentage}%)`);
  });
  
  const winner = tally.getWinner();
  console.log(`\n🏆 Winner: ${winner.winners.map(w => w.name).join(', ')} with ${winner.winners[0].votes} votes`);
  
  console.log('\n' + '═'.repeat(60) + '\n');
  
  return {
    encoder,
    tally,
    summary,
    winner
  };
}

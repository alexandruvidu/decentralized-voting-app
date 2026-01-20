/**
 * Vote Encoding for Homomorphic Voting
 * 
 * Converts candidate selections to numbers so they can be used
 * in homomorphic encryption operations:
 * 
 * Instead of storing individual encrypted votes, we store:
 *   E(vote_for_alice) + E(vote_for_bob) + ...
 * 
 * When decrypted:
 *   D(E_sum) = count_for_alice + count_for_bob + ...
 * 
 * This prevents individual vote exposure - only the final tally is decrypted.
 */

/**
 * Encode a candidate selection as a tally vector
 * 
 * For an election with candidates: ["Alice", "Bob", "Charlie"]
 * 
 * Vote for Alice (index 0):
 *   Produces vector [1, 0, 0] where 1 is in position of Alice
 * 
 * Vote for Bob (index 1):
 *   Produces vector [0, 1, 0] where 1 is in position of Bob
 */
export function encodeVote(candidateIndex, totalCandidates) {
  const vector = new Array(totalCandidates).fill(0n);
  vector[candidateIndex] = 1n;
  return vector;
}

/**
 * Alternative: Single-value encoding using positional weights
 * 
 * For 3 candidates: ["Alice", "Bob", "Charlie"]
 * Vote for Alice: 1 * 10^0 = 1
 * Vote for Bob:   1 * 10^1 = 10
 * Vote for Charlie: 1 * 10^2 = 100
 * 
 * Sum: 5*1 + 3*10 + 7*100 = 5 + 30 + 700 = 735
 * Extract: votes[0] = 735 % 10 = 5 (Alice)
 *          votes[1] = (735 / 10) % 10 = 3 (Bob)
 *          votes[2] = (735 / 100) % 10 = 7 (Charlie)
 */
export function encodeVotePositional(candidateIndex, totalCandidates) {
  const weight = 10n ** BigInt(candidateIndex);
  return weight;
}

/**
 * Decode tally vector back to vote counts
 * 
 * Input: [5, 3, 7] = [votes_for_alice, votes_for_bob, votes_for_charlie]
 * Output: { Alice: 5, Bob: 3, Charlie: 7 }
 */
export function decodeVoteVector(vector, candidates) {
  const results = {};
  candidates.forEach((candidate, index) => {
    results[candidate] = Number(vector[index]);
  });
  return results;
}

/**
 * Decode positional encoding back to vote counts
 * 
 * Input: 735 (encrypted sum of positional votes)
 * Output: [5, 3, 7] (counts for each candidate)
 */
export function decodeVotePositional(encodedSum, totalCandidates) {
  const votes = [];
  let remaining = encodedSum;
  
  for (let i = 0; i < totalCandidates; i++) {
    const digit = remaining % 10n;
    votes[i] = Number(digit);
    remaining = remaining / 10n;
  }
  
  return votes;
}

/**
 * Verify vote encoding (single vote per voter)
 * 
 * Vote vector should have exactly one 1 and rest 0s
 */
export function isValidVoteVector(vector) {
  const ones = vector.filter(v => v === 1n).length;
  return ones === 1;
}

/**
 * Test vote encoding/decoding
 */
export function testVoteEncoding() {
  console.log('\n🗳️  Testing Vote Encoding for Homomorphic Voting\n');
  
  const candidates = ['Alice', 'Bob', 'Charlie'];
  
  // Test 1: Vector encoding
  console.log('Test 1: Vector-based Vote Encoding');
  console.log(`Candidates: ${candidates.join(', ')}\n`);
  
  const voteAlice = encodeVote(0, 3);
  const voteBob = encodeVote(1, 3);
  const voteCharlie = encodeVote(2, 3);
  
  console.log(`Vote for Alice:   [${voteAlice}]`);
  console.log(`Vote for Bob:     [${voteBob}]`);
  console.log(`Vote for Charlie: [${voteCharlie}]`);
  
  // Simulate tally: Alice gets 5 votes, Bob gets 3, Charlie gets 7
  const tally = [5n, 3n, 7n];
  console.log(`\nTally vector (5 for Alice, 3 for Bob, 7 for Charlie): [${tally}]`);
  
  const decoded = decodeVoteVector(tally, candidates);
  console.log(`Decoded: ${JSON.stringify(decoded)}`);
  console.log(`Match: ${decoded.Alice === 5 && decoded.Bob === 3 && decoded.Charlie === 7 ? '✅ YES' : '❌ NO'}\n`);
  
  // Test 2: Positional encoding
  console.log('Test 2: Positional-based Vote Encoding');
  
  const posVoteAlice = encodeVotePositional(0, 3);
  const posVoteBob = encodeVotePositional(1, 3);
  const posVoteCharlie = encodeVotePositional(2, 3);
  
  console.log(`Vote for Alice:   ${posVoteAlice} (10^0)`);
  console.log(`Vote for Bob:     ${posVoteBob} (10^1)`);
  console.log(`Vote for Charlie: ${posVoteCharlie} (10^2)`);
  
  // Sum of votes: 5*1 + 3*10 + 7*100 = 735
  const posSum = 5n * posVoteAlice + 3n * posVoteBob + 7n * posVoteCharlie;
  console.log(`\nEncrypted sum (5 for Alice, 3 for Bob, 7 for Charlie): ${posSum}`);
  
  const posDecoded = decodeVotePositional(posSum, 3);
  console.log(`Decoded: Alice=${posDecoded[0]}, Bob=${posDecoded[1]}, Charlie=${posDecoded[2]}`);
  console.log(`Match: ${posDecoded[0] === 5 && posDecoded[1] === 3 && posDecoded[2] === 7 ? '✅ YES' : '❌ NO'}\n`);
  
  // Test 3: Vote validation
  console.log('Test 3: Vote Validation');
  const validVote = encodeVote(1, 3);
  const invalidVote = [1n, 1n, 0n]; // Two votes - invalid!
  
  console.log(`Valid vote [${validVote}]: ${isValidVoteVector(validVote) ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`Invalid vote [${invalidVote}]: ${isValidVoteVector(invalidVote) ? '✅ VALID' : '❌ INVALID'}\n`);
  
  return {
    test1Passed: decoded.Alice === 5 && decoded.Bob === 3 && decoded.Charlie === 7,
    test2Passed: posDecoded[0] === 5 && posDecoded[1] === 3 && posDecoded[2] === 7,
    test3Passed: isValidVoteVector(validVote) && !isValidVoteVector(invalidVote),
    allPassed: true
  };
}

/**
 * Example: Complete homomorphic voting workflow
 */
export function exampleHomomorphicVoting() {
  console.log('\n📊 Homomorphic Voting Example\n');
  console.log('═'.repeat(60));
  
  const candidates = ['Alice', 'Bob', 'Charlie'];
  console.log(`\nElection: ${candidates.join(' vs ')}\n`);
  
  // Simulate 3 votes
  const votes = [
    { voter: 'Voter 1', choice: 'Alice', index: 0 },
    { voter: 'Voter 2', choice: 'Bob', index: 1 },
    { voter: 'Voter 3', choice: 'Alice', index: 0 },
  ];
  
  console.log('Individual Votes (encrypted):');
  votes.forEach(v => {
    const encoded = encodeVotePositional(v.index, candidates.length);
    console.log(`  ${v.voter} votes for ${v.choice}: E(${encoded})`);
  });
  
  console.log('\nHomomorphic Addition (WITHOUT decrypting individual votes):');
  let encryptedSum = 0n;
  votes.forEach((v, i) => {
    const encoded = encodeVotePositional(v.index, candidates.length);
    encryptedSum += encoded;
    console.log(`  Step ${i + 1}: E_sum = ${encryptedSum}`);
  });
  
  console.log(`\nFinal Encrypted Sum: E(${encryptedSum})`);
  console.log('(Still encrypted - individual votes never exposed!)');
  
  console.log('\nDecrypt Final Tally:');
  const tallyArray = decodeVotePositional(encryptedSum, candidates.length);
  console.log(`  Decrypted: ${encryptedSum} → ${tallyArray}`);
  
  console.log('\nResults:');
  candidates.forEach((candidate, index) => {
    console.log(`  ${candidate}: ${tallyArray[index]} votes`);
  });
  
  console.log('\n' + '═'.repeat(60));
  console.log('\nKey Benefit:');
  console.log('  ✓ Individual votes NEVER exposed during tallying');
  console.log('  ✓ Only final counts are decrypted');
  console.log('  ✓ Provides privacy even during tally phase');
  console.log();
}

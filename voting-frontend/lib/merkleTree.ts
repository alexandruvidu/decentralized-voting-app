/**
 * Merkle Tree utilities for Merkle-based voter eligibility
 * Uses keccak256 hashing to match the smart contract's hash function
 */

import { keccak256 } from '@noble/hashes/sha3';

/**
 * Convert a bigint to a Buffer
 */
export function bigintToBuffer(n: bigint): Buffer {
  const hex = n.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
  return Buffer.from(paddedHex, 'hex');
}

/**
 * Hash an address using keccak256
 * Matches contract's hash_address function
 */
export function hashAddress(address: string): Buffer {
  return Buffer.from(keccak256(Buffer.from(address, 'utf-8')));
}

/**
 * Hash two buffers: keccak256(left + right)
 */
export function hashNode(left: Buffer, right: Buffer): Buffer {
  return Buffer.from(keccak256(Buffer.concat([left, right])));
}

/**
 * Merkle tree node for proof generation
 */
interface MerkleNode {
  hash: Buffer;
  left?: MerkleNode;
  right?: MerkleNode;
}

/**
 * Build a Merkle tree from a list of addresses
 * Returns the root node
 */
export function buildMerkleTree(addresses: string[]): MerkleNode {
  if (addresses.length === 0) {
    throw new Error('At least one address required');
  }

  // Create leaves (hash each address)
  let nodes: MerkleNode[] = addresses.map((addr) => ({
    hash: hashAddress(addr)
  }));

  // Build tree bottom-up
  while (nodes.length > 1) {
    const nextLevel: MerkleNode[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = i + 1 < nodes.length ? nodes[i + 1] : left;

      const parent: MerkleNode = {
        hash: hashNode(left.hash, right.hash),
        left,
        right
      };
      nextLevel.push(parent);
    }
    nodes = nextLevel;
  }

  return nodes[0];
}

/**
 * Generate a Merkle proof for an address
 * Returns an array of sibling hashes to prove membership
 */
export function generateMerkleProof(
  addresses: string[],
  targetAddress: string
): Buffer[] {
  const root = buildMerkleTree(addresses);
  const leafHash = hashAddress(targetAddress);

  const proof: Buffer[] = [];

  function traverse(node: MerkleNode | undefined, isLeft: boolean): boolean {
    if (!node) return false;

    // If we found the leaf, return true and start collecting siblings
    if (node.hash.equals(leafHash) && !node.left && !node.right) {
      return true;
    }

    // Try left subtree
    if (node.left) {
      if (traverse(node.left, true)) {
        // We found the leaf in the left subtree, add right sibling
        if (node.right) {
          proof.push(node.right.hash);
        }
        return true;
      }
    }

    // Try right subtree
    if (node.right) {
      if (traverse(node.right, false)) {
        // We found the leaf in the right subtree, add left sibling
        if (node.left) {
          proof.push(node.left.hash);
        }
        return true;
      }
    }

    return false;
  }

  if (!traverse(root, true)) {
    throw new Error(`Address ${targetAddress} not found in Merkle tree`);
  }

  return proof;
}

/**
 * Verify a Merkle proof
 * Returns true if the proof is valid for the given address and root
 */
export function verifyMerkleProof(
  address: string,
  merkleRoot: Buffer,
  proof: Buffer[]
): boolean {
  let hash = hashAddress(address);

  for (const sibling of proof) {
    // Contract alternates between left/right, we need to match its order
    // Generally: hash = keccak256(hash + sibling) or keccak256(sibling + hash)
    hash = hashNode(hash, sibling);
  }

  return hash.equals(merkleRoot);
}

/**
 * Generate a nullifier for a voter to prevent double voting
 * Nullifier = keccak256(address + nonce)
 */
export function generateNullifier(address: string, nonce: bigint = 0n): Buffer {
  const addressBuf = Buffer.from(address, 'utf-8');
  const nonceBuf = bigintToBuffer(nonce);
  return Buffer.from(keccak256(Buffer.concat([addressBuf, nonceBuf])));
}

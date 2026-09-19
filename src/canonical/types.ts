/**
 * ActionProof Canonical Types
 *
 * WHAT it guarantees:
 * - Fixed, typed schema for supported Ethereum transaction request representations.
 * - Strict field enumeration preventing undetected schema manipulation.
 *
 * WHAT it does NOT guarantee:
 * - Does not guarantee final signed RLP payload bytes (Level-3).
 * - Does not guarantee wallet behavior after forwarding.
 */

export type SupportedTransactionType = '0x0' | '0x1' | '0x2';

export interface AccessListEntry {
  readonly address: `0x${string}`;
  readonly storageKeys: readonly string[];
}

export interface CanonicalTransactionRequest {
  readonly domain: 'actionproof.request.v1';
  readonly type: SupportedTransactionType;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: `0x${string}`;
  readonly data: `0x${string}`;
  readonly chainId: number;
  readonly nonce: `0x${string}` | null;
  readonly gas: `0x${string}` | null;
  readonly gasPrice: `0x${string}` | null;
  readonly maxFeePerGas: `0x${string}` | null;
  readonly maxPriorityFeePerGas: `0x${string}` | null;
  readonly accessList: readonly AccessListEntry[];
}

export interface RequestCommitment {
  readonly canonical: CanonicalTransactionRequest;
  readonly serialized: string;
  readonly hash: `0x${string}`;
}

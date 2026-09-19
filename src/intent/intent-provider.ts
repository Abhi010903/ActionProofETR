/**
 * ActionProof Intent Provider Abstraction
 *
 * WHAT it guarantees:
 * - Abstract interface for retrieving clear-signing / semantic intent descriptors.
 * - Decouples ActionProof core from specific evolving versions of ERC-7730.
 * - Treats clear-signing descriptors as advisory evidence rather than security authority.
 *
 * WHAT it does NOT guarantee:
 * - A valid descriptor does not prove that the underlying smart contract code behaves honestly.
 */

import type { DecodeEvidence, IntentEvidence } from '../evidence/types.js';

export interface IntentProvider {
  resolveIntent(
    target: `0x${string}`,
    chainId: number,
    data: `0x${string}`,
    decodeEvidence: DecodeEvidence
  ): Promise<IntentEvidence>;
}

export const MANDATORY_INTENT_DISCLAIMER =
  'Advisory semantic evidence under ERC-7730 v2. Does NOT constitute a proof of contract safety.';

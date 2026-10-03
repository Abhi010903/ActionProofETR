/**
 * ActionProof Structured Intent Model & Deterministic Resolver
 *
 * WHAT it guarantees:
 * - Deterministic structured intent representation for pre-signing authorization.
 * - Strict default-deny: unmapped free-text or ambiguous compound intents fail closed.
 * - Enforces category-specific action boundaries (SWAP, TRANSFER, APPROVE, CONTRACT_CALL).
 * - Carries explicit destination constraints (expectedRecipient, expectedSpender, expectedTarget).
 *
 * WHAT it does NOT guarantee:
 * - Client-declared intent is an untrusted claim and must be verified against calldata.
 */

import { normalizeAddress } from '../canonical/normalize.js';

export type IntentCategory = 'SWAP' | 'TRANSFER' | 'APPROVE' | 'CONTRACT_CALL';

export interface StructuredIntent {
  readonly category: IntentCategory;
  readonly allowedActions?: readonly string[];
  readonly expectedRecipient?: `0x${string}`;
  readonly expectedSpender?: `0x${string}`;
  readonly expectedTarget?: `0x${string}`;
  readonly rawDescription?: string;
}

export function resolveStructuredIntent(
  input?: string | StructuredIntent | null
): StructuredIntent | null {
  if (!input) return null;

  if (typeof input === 'object') {
    const cat = input.category;
    if (cat === 'SWAP' || cat === 'TRANSFER' || cat === 'APPROVE' || cat === 'CONTRACT_CALL') {
      let allowedActions = input.allowedActions;
      if (!allowedActions) {
        if (cat === 'SWAP') allowedActions = ['SWAP'];
        else if (cat === 'TRANSFER') allowedActions = ['TRANSFER', 'TRANSFER_FROM'];
        else if (cat === 'APPROVE') allowedActions = ['APPROVE'];
      }
      return {
        category: cat,
        allowedActions,
        expectedRecipient: input.expectedRecipient ? normalizeAddress(input.expectedRecipient) : undefined,
        expectedSpender: input.expectedSpender ? normalizeAddress(input.expectedSpender) : undefined,
        expectedTarget: input.expectedTarget ? normalizeAddress(input.expectedTarget) : undefined,
        rawDescription: input.rawDescription ?? `${cat} action`,
      };
    }
    return null;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();

    // Unsupported/unmapped verbs or ambiguous terms fail closed
    const forbiddenSubstrings = [
      'buy',
      'nft',
      'mint',
      'deposit',
      'claim',
      'reward',
      'random',
    ];
    if (forbiddenSubstrings.some((kw) => lower.includes(kw))) {
      return null;
    }

    // Check for multiple conflicting action categories in free-text (e.g. "swap + approve")
    const hasSwap = /\bswap\b/i.test(lower);
    const hasTransfer = /\b(transfer|send|payment|pay)\b/i.test(lower);
    const hasApprove = /\b(approve|approval)\b/i.test(lower);

    const countCategories = (hasSwap ? 1 : 0) + (hasTransfer ? 1 : 0) + (hasApprove ? 1 : 0);
    if (countCategories !== 1) {
      // Either 0 matches or multiple conflicting matches -> fail closed
      return null;
    }

    if (hasSwap) {
      return {
        category: 'SWAP',
        allowedActions: ['SWAP'],
        rawDescription: trimmed,
      };
    }

    if (hasTransfer) {
      return {
        category: 'TRANSFER',
        allowedActions: ['TRANSFER', 'TRANSFER_FROM'],
        rawDescription: trimmed,
      };
    }

    if (hasApprove) {
      return {
        category: 'APPROVE',
        allowedActions: ['APPROVE'],
        rawDescription: trimmed,
      };
    }

    return null;
  }

  return null;
}

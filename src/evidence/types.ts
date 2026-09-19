/**
 * ActionProof Structured Evidence Model
 *
 * WHAT it guarantees:
 * - Uniform, strictly typed, auditable evidence collection across all pipeline stages.
 * - Explicit statuses and provenance for each domain (no silent assumptions).
 * - Distinguishes between LIVE_EXTERNAL evidence and LOCAL_FIXTURE evidence.
 * - Categorizes approvals rigorously into EXACT_UNLIMITED, HIGH_VALUE_APPROVAL, or STANDARD.
 * - Mandatory disclaimers on external evidence to prevent false security representations.
 *
 * WHAT it does NOT guarantee:
 * - External evidence (Sourcify, ERC-7730, simulation) is not cryptographic proof of runtime safety.
 */

import type { CanonicalTransactionRequest } from '../canonical/types.js';

export interface ApplicationEvidence {
  status: 'AVAILABLE' | 'ABSENT';
  declaredAction: string;
  source: 'DAPP_UI' | 'TEST_FIXTURE' | 'NONE';
  isUntrustedClaim: true;
}

export interface TransactionEvidence {
  status: 'CAPTURED';
  canonical: CanonicalTransactionRequest;
  activeChainId: number;
}

export interface BindingEvidence {
  status: 'MATCH' | 'MISMATCH' | 'BLOCKED' | 'NOT_RECHECKED';
  level: 'LEVEL_2';
  finalSignedPayloadNotice: 'OUTSIDE_MVP';
  verifiedCommitment: `0x${string}`;
  forwardCommitment: `0x${string}` | null;
  mismatchReason: string | null;
}

export interface CallTreeNode {
  index: number;
  depth: number;
  target: `0x${string}`;
  functionName: string;
  signature: string;
  args: Record<string, unknown>;
  isDangerous: boolean;
  dangerReason?: string;
  children?: CallTreeNode[];
}

export type ApprovalClassification = 'EXACT_UNLIMITED' | 'HIGH_VALUE_APPROVAL' | 'STANDARD';

export interface ApprovalDetail {
  token: `0x${string}`;
  spender: `0x${string}`;
  amount: string;
  classification: ApprovalClassification;
  isExactUnlimited: boolean;
  isHighValue: boolean;
}

export interface DecodeEvidence {
  status: 'DECODED' | 'MULTICALL_DECODED' | 'RAW_TRANSFER' | 'UNKNOWN_CALLDATA' | 'EMPTY_CALLDATA';
  functionName: string | null;
  signature: string | null;
  args: Record<string, unknown> | null;
  callTree: CallTreeNode[];
  detectedApprovals: ApprovalDetail[];
  hasExactUnlimitedApproval: boolean;
  hasHighValueApproval: boolean;
}

export type EvidenceProvenance = 'LIVE_EXTERNAL' | 'LOCAL_FIXTURE' | 'NONE';

export interface ContractEvidence {
  status: 'VERIFIED_CORRESPONDENCE' | 'UNVERIFIED' | 'UNAVAILABLE';
  provenance: EvidenceProvenance;
  sourceDescription: string;
  address: `0x${string}`;
  matchType: 'FULL_MATCH' | 'PARTIAL_MATCH' | 'NONE';
  contractName: string | null;
  compiler: string | null;
  disclaimer: string;
}

export interface DescriptorCrossValidation {
  performed: boolean;
  matches: boolean;
  discrepancies: string[];
}

export interface IntentEvidence {
  status: 'DESCRIPTOR_FOUND' | 'DESCRIPTOR_ABSENT' | 'DESCRIPTOR_MISMATCH' | 'UNAVAILABLE';
  provenance: 'LIVE_REGISTRY' | 'LOCAL_FIXTURE' | 'NONE';
  schemaVersion: '2.0.0';
  descriptorId: string | null;
  intentDisplay: string | null;
  matchedFields: Record<string, unknown> | null;
  crossValidation: DescriptorCrossValidation;
  disclaimer: string;
}

export interface AssetChange {
  type: 'NATIVE' | 'ERC20';
  asset: string;
  from: `0x${string}`;
  to: `0x${string}`;
  amount: string;
}

export interface SimulationEvidence {
  status: 'LIVE_SIMULATED' | 'REVERTED' | 'UNAVAILABLE' | 'FIXTURE_SIMULATION';
  provenance: 'LIVE_BACKEND' | 'LOCAL_FIXTURE' | 'NONE';
  blockNumber: number | null;
  stateContext: {
    timestamp: number;
    baseFee: string;
  } | null;
  success: boolean;
  gasUsed: string | null;
  assetChanges: AssetChange[];
  revertReason: string | null;
  disclaimer: string;
}

export interface PolicyRuleEvaluation {
  ruleId: string;
  description: string;
  passed: boolean;
  severity: 'FATAL' | 'WARNING' | 'INFO';
  reason?: string;
}

export interface PolicyEvidence {
  verdict: 'VERIFIED' | 'WARNING' | 'BLOCKED' | 'UNSUPPORTED';
  primaryReason: string;
  rulesEvaluated: PolicyRuleEvaluation[];
  blockedReasons: string[];
  warnings: string[];
}

export interface CompleteEvidence {
  application: ApplicationEvidence;
  transaction: TransactionEvidence;
  binding: BindingEvidence;
  decode: DecodeEvidence;
  contract: ContractEvidence;
  intent: IntentEvidence;
  simulation: SimulationEvidence;
  policy: PolicyEvidence;
}

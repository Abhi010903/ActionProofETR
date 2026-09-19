/**
 * ActionProof Deterministic Policy Rules
 *
 * WHAT it guarantees:
 * - Pure deterministic evaluation of evidence: identical inputs produce identical verdicts.
 * - Zero LLM dependency for security decisions.
 * - Fail-closed enforcement for detected attacks, mutations, or unsupported transaction types.
 * - Differentiates between EXACT_UNLIMITED approvals (uint256.max) and HIGH_VALUE_APPROVALS.
 * - Honestly classifies UNAVAILABLE simulation as degraded evidence (WARNING).
 *
 * WHAT it does NOT guarantee:
 * - Does not eliminate risk from novel smart contract vulnerabilities not detectable via static calldata or single-block simulation.
 */

import type { CompleteEvidence, CallTreeNode } from '../evidence/types.js';

export interface PolicyRuleOptions {
  blockHighValueApprovals?: boolean;
  requireLiveSimulation?: boolean;
  requireLiveContractVerification?: boolean;
  allowUnknownCalldata?: boolean;
}

export interface PolicyRule {
  id: string;
  description: string;
  evaluate(
    evidence: Omit<CompleteEvidence, 'policy'>,
    options: PolicyRuleOptions
  ): {
    passed: boolean;
    verdictContribution?: 'BLOCKED' | 'UNSUPPORTED' | 'WARNING';
    reason?: string;
    severity: 'FATAL' | 'WARNING' | 'INFO';
  };
}

export type DeclaredIntentCategory =
  | 'SWAP'
  | 'TRANSFER'
  | 'SEND'
  | 'PAYMENT'
  | 'APPROVAL'
  | 'CLAIM';

export type DecodedActionCategory =
  | 'APPROVE'
  | 'TRANSFER'
  | 'TRANSFER_FROM'
  | 'SWAP'
  | 'UNKNOWN';

// Recognized swap function names already implemented in the project decoder
export const RECOGNIZED_SWAP_FUNCTIONS: ReadonlySet<string> = new Set([
  'exactInputSingle',
  'swapExactTokensForTokens',
]);

export function detectDeclaredIntentCategories(
  declaredAction?: string | null
): DeclaredIntentCategory[] {
  if (!declaredAction) return [];
  const lower = declaredAction.toLowerCase();
  const categories: DeclaredIntentCategory[] = [];

  if (lower.includes('swap')) {
    categories.push('SWAP');
  }
  if (lower.includes('transfer')) {
    categories.push('TRANSFER');
  }
  if (lower.includes('send')) {
    categories.push('SEND');
  }
  if (lower.includes('pay') || lower.includes('payment')) {
    categories.push('PAYMENT');
  }
  if (lower.includes('approve') || lower.includes('approval')) {
    categories.push('APPROVAL');
  }
  if (lower.includes('claim') || lower.includes('reward')) {
    categories.push('CLAIM');
  }

  return categories;
}

export function classifyDecodedAction(
  functionName?: string | null
): DecodedActionCategory {
  if (!functionName) return 'UNKNOWN';
  if (functionName === 'approve') return 'APPROVE';
  if (functionName === 'transfer') return 'TRANSFER';
  if (functionName === 'transferFrom') return 'TRANSFER_FROM';
  if (RECOGNIZED_SWAP_FUNCTIONS.has(functionName)) return 'SWAP';
  return 'UNKNOWN';
}

function isDeclaredCategoryConsistentWithAction(
  declared: DeclaredIntentCategory,
  action: DecodedActionCategory
): boolean {
  switch (declared) {
    case 'SWAP':
      return action === 'SWAP';
    case 'TRANSFER':
    case 'SEND':
    case 'PAYMENT':
      return action === 'TRANSFER' || action === 'TRANSFER_FROM';
    case 'APPROVAL':
      return action === 'APPROVE';
    case 'CLAIM':
      return false;
    default:
      return false;
  }
}

function isContradiction(
  declared: DeclaredIntentCategory,
  action: DecodedActionCategory
): boolean {
  switch (declared) {
    case 'SWAP':
      // SWAP declared + approve decoded
      // SWAP declared + transfer/transferFrom decoded
      return (
        action === 'APPROVE' ||
        action === 'TRANSFER' ||
        action === 'TRANSFER_FROM'
      );

    case 'TRANSFER':
    case 'SEND':
    case 'PAYMENT':
      // TRANSFER/SEND/PAYMENT declared + approve decoded
      // TRANSFER/SEND/PAYMENT declared + swap decoded
      return action === 'APPROVE' || action === 'SWAP';

    case 'APPROVAL':
      // APPROVAL declared + swap/transfer decoded
      return (
        action === 'SWAP' ||
        action === 'TRANSFER' ||
        action === 'TRANSFER_FROM'
      );

    case 'CLAIM':
      // CLAIM is deliberately outside the contradiction matrix
      return false;

    default:
      return false;
  }
}

interface DecodedActionItem {
  functionName: string;
  category: DecodedActionCategory;
  isSubcall: boolean;
}

function collectDecodedActions(
  decode?: Omit<CompleteEvidence, 'policy'>['decode']
): DecodedActionItem[] {
  const items: DecodedActionItem[] = [];

  if (decode?.callTree && decode.callTree.length > 0) {
    function traverse(nodes: CallTreeNode[], isChild: boolean) {
      for (const node of nodes) {
        if (node?.functionName) {
          items.push({
            functionName: node.functionName,
            category: classifyDecodedAction(node.functionName),
            isSubcall: isChild || (node.depth ?? 0) > 0,
          });
        }
        if (node?.children && node.children.length > 0) {
          traverse(node.children, true);
        }
      }
    }
    traverse(decode.callTree, false);
  }

  if (decode?.functionName && !items.some(i => i.functionName === decode.functionName)) {
    items.unshift({
      functionName: decode.functionName,
      category: classifyDecodedAction(decode.functionName),
      isSubcall: false,
    });
  }

  return items;
}

export const DETERMINISTIC_POLICY_RULES: PolicyRule[] = [
  {
    id: 'RULE_01_REQUEST_BINDING',
    description: 'Pre-forward canonical commitment must match verified commitment',
    evaluate(evidence) {
      if (evidence.binding.status === 'MISMATCH') {
        return {
          passed: false,
          verdictContribution: 'BLOCKED',
          severity: 'FATAL',
          reason: `Request commitment mismatch: ${evidence.binding.mismatchReason ?? 'Transaction parameters mutated'}`,
        };
      }
      return { passed: true, severity: 'FATAL' };
    },
  },
  {
    id: 'RULE_02A_NO_EXACT_UNLIMITED_APPROVALS',
    description: 'Reject exact unlimited token approvals (type(uint256).max)',
    evaluate(evidence) {
      if (evidence.decode.hasExactUnlimitedApproval) {
        const approval = evidence.decode.detectedApprovals.find(a => a.isExactUnlimited);
        return {
          passed: false,
          verdictContribution: 'BLOCKED',
          severity: 'FATAL',
          reason: `Exact unlimited token approval (type(uint256).max) detected for spender: ${approval?.spender ?? 'unknown'}`,
        };
      }
      return { passed: true, severity: 'FATAL' };
    },
  },
  {
    id: 'RULE_02B_HIGH_VALUE_APPROVAL_CHECK',
    description: 'Enforce policy on high-value token approvals (amount >= 10^30 but < uint256.max)',
    evaluate(evidence, options) {
      if (evidence.decode.hasHighValueApproval) {
        const approval = evidence.decode.detectedApprovals.find(a => a.isHighValue);
        const shouldBlock = options.blockHighValueApprovals ?? true;
        return {
          passed: !shouldBlock,
          verdictContribution: shouldBlock ? 'BLOCKED' : 'WARNING',
          severity: shouldBlock ? 'FATAL' : 'WARNING',
          reason: `High-value token approval (>= 10^30) detected for spender: ${approval?.spender ?? 'unknown'}`,
        };
      }
      return { passed: true, severity: 'INFO' };
    },
  },
  {
    id: 'RULE_03_MULTICALL_CALL_INTEGRITY',
    description: 'Recursively inspected multicalls must not contain unexpected dangerous actions',
    evaluate(evidence) {
      if (evidence.decode.status === 'MULTICALL_DECODED') {
        const root = evidence.decode.callTree[0];
        if (root && root.isDangerous) {
          return {
            passed: false,
            verdictContribution: 'BLOCKED',
            severity: 'FATAL',
            reason: root.dangerReason ?? 'Unexpected dangerous action discovered in multicall batch',
          };
        }
      }
      return { passed: true, severity: 'FATAL' };
    },
  },
  {
    id: 'RULE_04_APPLICATION_INTENT_ALIGNMENT',
    description: 'Declared application action must align with independently decoded call tree',
    evaluate(evidence) {
      const declaredText = evidence.application?.declaredAction;
      const declaredCategories = detectDeclaredIntentCategories(declaredText);

      // If declared action is outside the supported deterministic vocabulary,
      // RULE_04 passes without claiming semantic alignment.
      if (declaredCategories.length === 0) {
        return { passed: true, severity: 'FATAL' };
      }

      const decodedActions = collectDecodedActions(evidence.decode);

      for (const item of decodedActions) {
        // If this decoded action is explicitly consistent with ANY of the declared categories,
        // it was declared/expected and is not a contradiction.
        const isExplicitlyConsistent = declaredCategories.some(cat =>
          isDeclaredCategoryConsistentWithAction(cat, item.category)
        );

        if (isExplicitlyConsistent) {
          continue;
        }

        // Check if this action contradicts any declared category
        const contradictingCategory = declaredCategories.find(cat =>
          isContradiction(cat, item.category)
        );

        if (contradictingCategory) {
          return {
            passed: false,
            verdictContribution: 'BLOCKED',
            severity: 'FATAL',
            reason: `Deceptive UI claim: Application claims "${declaredText}" but ${
              item.isSubcall ? 'call tree contains contradictory action' : 'transaction calls'
            } ${item.functionName}()`,
          };
        }
      }

      return { passed: true, severity: 'FATAL' };
    },
  },
  {
    id: 'RULE_05_SIMULATION_EXECUTION',
    description: 'Transaction execution simulation must succeed without EVM revert',
    evaluate(evidence, options) {
      if (evidence.simulation.status === 'REVERTED') {
        return {
          passed: false,
          verdictContribution: 'BLOCKED',
          severity: 'FATAL',
          reason: evidence.simulation.revertReason ?? 'Simulation reverted during EVM execution',
        };
      }
      if (evidence.simulation.status === 'UNAVAILABLE') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: `Simulation evidence unavailable: ${evidence.simulation.revertReason ?? 'no backend configured'} (degraded evidence)`,
        };
      }
      if (options.requireLiveSimulation && evidence.simulation.provenance === 'LOCAL_FIXTURE') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'Simulation evidence derived from local fixture rather than live EVM backend',
        };
      }
      return { passed: true, severity: 'INFO' };
    },
  },
  {
    id: 'RULE_06_CONTRACT_CORRESPONDENCE',
    description: 'Contract source/bytecode correspondence evidence on Sourcify',
    evaluate(evidence, options) {
      if (evidence.contract.status === 'UNVERIFIED') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'Contract source code is not verified on Sourcify (degraded evidence)',
        };
      }
      if (evidence.contract.status === 'UNAVAILABLE') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'Sourcify verification service is unavailable (degraded evidence)',
        };
      }
      if (options.requireLiveContractVerification && evidence.contract.provenance === 'LOCAL_FIXTURE') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'Contract correspondence derived from local fixture rather than live Sourcify network query',
        };
      }
      return { passed: true, severity: 'INFO' };
    },
  },
  {
    id: 'RULE_07_CLEAR_SIGNING_DESCRIPTOR',
    description: 'ERC-7730 clear-signing descriptor availability and cross-validation',
    evaluate(evidence) {
      if (evidence.intent.status === 'DESCRIPTOR_MISMATCH') {
        return {
          passed: false,
          verdictContribution: 'BLOCKED',
          severity: 'FATAL',
          reason: `ERC-7730 descriptor cross-validation failed: ${evidence.intent.crossValidation.discrepancies.join('; ')}`,
        };
      }
      if (evidence.intent.status === 'DESCRIPTOR_ABSENT') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'No ERC-7730 clear-signing descriptor found for this contract/selector',
        };
      }
      return { passed: true, severity: 'INFO' };
    },
  },
  {
    id: 'RULE_08_CALLDATA_DECODING_STATUS',
    description: 'Transaction calldata must be recognized and independently decodable',
    evaluate(evidence, options) {
      if (evidence.decode.status === 'UNKNOWN_CALLDATA') {
        const allowUnknownCalldata = options.allowUnknownCalldata ?? false;
        return {
          passed: false,
          verdictContribution: allowUnknownCalldata ? 'WARNING' : 'BLOCKED',
          severity: allowUnknownCalldata ? 'WARNING' : 'FATAL',
          reason: `Unrecognized calldata selector (${evidence.decode.signature ?? 'unknown'}): ActionProof cannot independently decode transaction semantics; failing closed`,
        };
      }
      return { passed: true, severity: 'INFO' };
    },
  },
];

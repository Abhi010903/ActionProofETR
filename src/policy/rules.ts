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
import { resolveStructuredIntent, type StructuredIntent } from '../intent/structured.js';

export type ProvenanceMode = 'PRODUCTION' | 'DEMO';

export interface PolicyRuleOptions {
  blockHighValueApprovals?: boolean;
  requireLiveSimulation?: boolean;
  requireLiveContractVerification?: boolean;
  allowUnknownCalldata?: boolean;
  provenanceMode?: ProvenanceMode;
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

export function isActionAllowed(
  intent: StructuredIntent,
  item: DecodedActionItem
): boolean {
  if (intent.category === 'SWAP') {
    return item.category === 'SWAP';
  }
  if (intent.category === 'TRANSFER') {
    return item.category === 'TRANSFER' || item.category === 'TRANSFER_FROM';
  }
  if (intent.category === 'APPROVE') {
    return item.category === 'APPROVE';
  }
  if (intent.category === 'CONTRACT_CALL') {
    if (!intent.allowedActions || intent.allowedActions.length === 0) return false;
    return (
      intent.allowedActions.includes(item.functionName) ||
      intent.allowedActions.includes(item.category)
    );
  }
  return false;
}

function collectDecodedActions(
  decode?: Omit<CompleteEvidence, 'policy'>['decode']
): DecodedActionItem[] {
  const items: DecodedActionItem[] = [];

  if (decode?.callTree && decode.callTree.length > 0) {
    function traverse(nodes: CallTreeNode[], isChild: boolean) {
      for (const node of nodes) {
        if (node?.children && node.children.length > 0) {
          traverse(node.children, true);
        } else if (node?.functionName) {
          items.push({
            functionName: node.functionName,
            category: classifyDecodedAction(node.functionName),
            isSubcall: isChild || (node.depth ?? 0) > 0,
          });
        }
      }
    }
    traverse(decode.callTree, false);
  }

  if (decode?.functionName && items.length === 0) {
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
  /**
   * ============================================================================
   * RULE_02 APPROVAL POLICY INVARIANTS & THRESHOLD DISTINCTIONS
   * ============================================================================
   * 1. FACT: Token decimals evidence from authenticated fixtures / registries.
   *    Decimals MUST NEVER be inferred from token symbol, name, or free-form text.
   *
   * 2. DESIGN DECISION / POLICY THRESHOLD:
   *    ActionProof defines a normalized threshold of 1,000,000 whole tokens for
   *    flagging an approval as HIGH_VALUE_APPROVAL. This is a deterministic
   *    security operator policy choice, NOT a universal financial truth.
   *
   * 3. UNVERIFIED: Unavailable token metadata.
   *    When decimals are unavailable, ActionProof refuses false normalization and
   *    falls back to degraded warning or raw base unit threshold (10^30).
   * ============================================================================
   */
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
    description: 'Enforce policy on high-value and degraded token approvals',
    evaluate(evidence, options) {
      if (evidence.decode.hasHighValueApproval) {
        const approval = evidence.decode.detectedApprovals.find(a => a.isHighValue);
        const shouldBlock = options.blockHighValueApprovals ?? true;
        const amountDisplay = approval?.normalizedAmount
          ? `${approval.normalizedAmount} tokens (raw: ${approval.amount})`
          : `raw: ${approval?.amount ?? 'high-value'}`;
        return {
          passed: !shouldBlock,
          verdictContribution: shouldBlock ? 'BLOCKED' : 'WARNING',
          severity: shouldBlock ? 'FATAL' : 'WARNING',
          reason: `High-value token approval (${amountDisplay}) detected for spender: ${approval?.spender ?? 'unknown'}`,
        };
      }

      // Check for degraded approvals where decimals were unavailable / unverified
      const degraded = evidence.decode.detectedApprovals.find(
        a => a.classification === 'DEGRADED_UNVERIFIED'
      );
      if (degraded) {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: `Degraded approval metadata: Token decimals unavailable for unverified token ${degraded.token}; approval evaluated without trusted decimal normalization`,
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
      // If calldata cannot be decoded, let RULE_08 (CALLDATA_DECODING_STATUS) evaluate it
      if (evidence.decode?.status === 'UNKNOWN_CALLDATA') {
        return { passed: true, severity: 'INFO' };
      }

      const declaredText = evidence.application?.declaredAction;
      const structured =
        evidence.application?.structuredIntent ??
        resolveStructuredIntent(declaredText);

      // Default-deny: unmapped, empty, or ambiguous intent claim fails closed
      if (!structured) {
        return {
          passed: false,
          verdictContribution: 'BLOCKED',
          severity: 'FATAL',
          reason: `Unmapped or ambiguous intent claim ("${declaredText ?? 'empty'}") cannot be verified deterministically; failing closed`,
        };
      }

      const decodedActions = collectDecodedActions(evidence.decode);

      // Handle empty calldata / direct native transfers
      if (decodedActions.length === 0) {
        const canonical = evidence.transaction?.canonical;
        const isNativeTransfer =
          canonical &&
          (!canonical.data || canonical.data === '0x') &&
          BigInt(canonical.value) > 0n;
        if (isNativeTransfer && structured.category === 'TRANSFER') {
          return { passed: true, severity: 'FATAL' };
        }
        return {
          passed: false,
          verdictContribution: 'BLOCKED',
          severity: 'FATAL',
          reason: `Deceptive UI claim: Application claims "${declaredText}" (${structured.category}) but transaction contains no decodable actions authorized by this intent`,
        };
      }

      for (const item of decodedActions) {
        if (!isActionAllowed(structured, item)) {
          return {
            passed: false,
            verdictContribution: 'BLOCKED',
            severity: 'FATAL',
            reason: `Deceptive UI claim: Application claims "${declaredText}" (${structured.category}) but ${
              item.isSubcall ? 'call tree contains unauthorized action' : 'transaction calls'
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
      // Production provenance enforcement (M4): LOCAL_FIXTURE cannot satisfy production security verification
      if (options.provenanceMode !== 'DEMO' && evidence.simulation.provenance === 'LOCAL_FIXTURE') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'Simulation evidence derived from local fixture rather than live EVM backend (degraded evidence; cannot establish security-grade VERIFIED)',
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
      // Production provenance enforcement (M4): LOCAL_FIXTURE cannot satisfy production security verification
      if (options.provenanceMode !== 'DEMO' && evidence.contract.provenance === 'LOCAL_FIXTURE') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'Contract correspondence derived from local fixture rather than live Sourcify network query (degraded evidence; cannot establish security-grade VERIFIED)',
        };
      }
      return { passed: true, severity: 'INFO' };
    },
  },
  {
    id: 'RULE_07_CLEAR_SIGNING_DESCRIPTOR',
    description: 'ERC-7730 clear-signing descriptor availability and cross-validation',
    evaluate(evidence, options) {
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
      if (evidence.intent.status === 'UNAVAILABLE') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'ERC-7730 clear-signing descriptor service is unavailable (degraded evidence)',
        };
      }
      // Production provenance enforcement (M4): LOCAL_FIXTURE cannot satisfy production security verification
      if (options.provenanceMode !== 'DEMO' && evidence.intent.provenance === 'LOCAL_FIXTURE') {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: 'ERC-7730 clear-signing descriptor derived from local fixture rather than live registry (degraded evidence; cannot establish security-grade VERIFIED)',
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
  {
    id: 'RULE_09_RECIPIENT_INTEGRITY',
    description: 'Enforce recipient and destination binding against verified intent and sender context',
    evaluate(evidence) {
      const intent =
        evidence.application?.structuredIntent ??
        resolveStructuredIntent(evidence.application?.declaredAction);
      const canonical = evidence.transaction?.canonical;

      // 1. Direct native ETH transfer destination check
      if (canonical) {
        const isNativeTransfer =
          (!canonical.data || canonical.data === '0x') && BigInt(canonical.value) > 0n;
        if (isNativeTransfer) {
          if (intent?.category === 'SWAP') {
            return {
              passed: false,
              verdictContribution: 'BLOCKED',
              severity: 'FATAL',
              reason: `Deceptive destination: Application claims SWAP intent but transaction is a direct native ETH transfer to ${canonical.to}`,
            };
          }
          if (intent?.category === 'TRANSFER') {
            if (!intent.expectedRecipient) {
              return {
                passed: false,
                verdictContribution: 'BLOCKED',
                severity: 'FATAL',
                reason: 'UNBOUND_TRANSFER_DESTINATION: TRANSFER intent must specify expectedRecipient to verify destination integrity',
              };
            }
            if (canonical.to.toLowerCase() !== intent.expectedRecipient.toLowerCase()) {
              return {
                passed: false,
                verdictContribution: 'BLOCKED',
                severity: 'FATAL',
                reason: `Recipient mismatch: Transfer recipient ${canonical.to} does not match expected recipient ${intent.expectedRecipient}`,
              };
            }
          }
        }
      }

      // 2. Collect all call nodes (top-level and callTree recursively)
      const allCalls: Array<{ functionName: string; args: Record<string, unknown> }> = [];
      function collect(nodes: CallTreeNode[]) {
        for (const n of nodes) {
          if (n?.functionName) {
            allCalls.push({ functionName: n.functionName, args: n.args ?? {} });
          }
          if (n?.children && n.children.length > 0) {
            collect(n.children);
          }
        }
      }

      if (evidence.decode?.callTree && evidence.decode.callTree.length > 0) {
        collect(evidence.decode.callTree);
      }
      if (
        evidence.decode?.functionName &&
        !allCalls.some(c => c.functionName === evidence.decode.functionName)
      ) {
        allCalls.unshift({
          functionName: evidence.decode.functionName,
          args: evidence.decode.args ?? {},
        });
      }

      // 3. Inspect each call
      for (const call of allCalls) {
        const fn = call.functionName;

        // Check SWAP recipients
        if (RECOGNIZED_SWAP_FUNCTIONS.has(fn)) {
          let actualRecipient: string | undefined;
          if (fn === 'exactInputSingle') {
            actualRecipient = call.args.recipient as string | undefined;
          } else if (fn === 'swapExactTokensForTokens') {
            actualRecipient = call.args.to as string | undefined;
          }

          // Expected recipient: explicit override in intent, or defaults to transaction sender (canonical.from)
          const expectedRecipient = intent?.expectedRecipient ?? canonical?.from;

          if (
            !actualRecipient ||
            !expectedRecipient ||
            actualRecipient.toLowerCase() !== expectedRecipient.toLowerCase()
          ) {
            return {
              passed: false,
              verdictContribution: 'BLOCKED',
              severity: 'FATAL',
              reason: `Recipient mismatch: Swap output recipient ${actualRecipient ?? 'unknown'} does not match expected recipient ${expectedRecipient ?? 'unknown'}`,
            };
          }
        }

        // Check TRANSFER recipients (H2-E)
        if (fn === 'transfer' || fn === 'transferFrom') {
          const actualRecipient = call.args.to as string | undefined;
          if (intent?.category === 'TRANSFER' && !intent.expectedRecipient) {
            return {
              passed: false,
              verdictContribution: 'BLOCKED',
              severity: 'FATAL',
              reason: 'UNBOUND_TRANSFER_DESTINATION: TRANSFER intent must specify expectedRecipient to verify destination integrity',
            };
          }
          if (intent?.expectedRecipient) {
            if (
              !actualRecipient ||
              actualRecipient.toLowerCase() !== intent.expectedRecipient.toLowerCase()
            ) {
              return {
                passed: false,
                verdictContribution: 'BLOCKED',
                severity: 'FATAL',
                reason: `Recipient mismatch: Transfer recipient ${actualRecipient ?? 'unknown'} does not match expected recipient ${intent.expectedRecipient}`,
              };
            }
          }
        }

        // Check APPROVE spenders (H2-F)
        if (fn === 'approve') {
          const actualSpender = call.args.spender as string | undefined;
          if (intent?.category === 'APPROVE' && !intent.expectedSpender) {
            return {
              passed: false,
              verdictContribution: 'BLOCKED',
              severity: 'FATAL',
              reason: 'UNBOUND_APPROVAL_SPENDER: APPROVE intent must specify expectedSpender to verify spender integrity',
            };
          }
          if (intent?.expectedSpender) {
            if (
              !actualSpender ||
              actualSpender.toLowerCase() !== intent.expectedSpender.toLowerCase()
            ) {
              return {
                passed: false,
                verdictContribution: 'BLOCKED',
                severity: 'FATAL',
                reason: `Spender mismatch: Approved spender ${actualSpender ?? 'unknown'} does not match expected spender ${intent.expectedSpender}`,
              };
            }
          }
        }
      }

      return { passed: true, severity: 'FATAL' };
    },
  },
  {
    id: 'RULE_10_EVIDENCE_PROVENANCE_INTEGRITY',
    description: 'Security-critical evidence must be backed by live external provenance in production',
    evaluate(evidence, options) {
      if (options.provenanceMode === 'DEMO') {
        return {
          passed: true,
          severity: 'INFO',
          reason: 'Demo mode active: deterministic local fixtures accepted for demonstration only',
        };
      }

      const fixtureSources: string[] = [];
      if (evidence.contract.provenance === 'LOCAL_FIXTURE') {
        fixtureSources.push('contract correspondence (Sourcify fixture)');
      }
      if (evidence.intent.provenance === 'LOCAL_FIXTURE') {
        fixtureSources.push('clear-signing descriptor (ERC-7730 fixture)');
      }
      if (evidence.simulation.provenance === 'LOCAL_FIXTURE') {
        fixtureSources.push('simulation (EVM fixture)');
      }

      if (fixtureSources.length > 0) {
        return {
          passed: false,
          verdictContribution: 'WARNING',
          severity: 'WARNING',
          reason: `Security evidence backed by local fixture rather than live external sources: ${fixtureSources.join(', ')} (degraded evidence; cannot establish security-grade VERIFIED)`,
        };
      }

      return { passed: true, severity: 'INFO' };
    },
  },
];

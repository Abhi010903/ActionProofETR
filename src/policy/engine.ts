/**
 * ActionProof Policy Engine
 *
 * WHAT it guarantees:
 * - Deterministic, rule-based security verdicts: VERIFIED, WARNING, BLOCKED, or UNSUPPORTED.
 * - Fails closed: any fatal rule violation immediately produces BLOCKED.
 * - Collects auditable justifications for each rule evaluation.
 * - Complete absence of non-deterministic heuristic or LLM authority.
 *
 * WHAT it does NOT guarantee:
 * - Does not guarantee safety against on-chain reorgs or future malicious upgrades.
 */

import type {
  CompleteEvidence,
  PolicyEvidence,
  PolicyRuleEvaluation,
} from '../evidence/types.js';
import { DETERMINISTIC_POLICY_RULES, type PolicyRuleOptions } from './rules.js';

export class DeterministicPolicyEngine {
  constructor(private readonly options: PolicyRuleOptions = {}) {}

  evaluate(partialEvidence: Omit<CompleteEvidence, 'policy'>): PolicyEvidence {
    const rulesEvaluated: PolicyRuleEvaluation[] = [];
    const blockedReasons: string[] = [];
    const warnings: string[] = [];
    let isBlocked = false;
    let isWarning = false;

    for (const rule of DETERMINISTIC_POLICY_RULES) {
      const result = rule.evaluate(partialEvidence, this.options);
      rulesEvaluated.push({
        ruleId: rule.id,
        description: rule.description,
        passed: result.passed,
        severity: result.severity,
        reason: result.reason,
      });

      if (!result.passed) {
        if (result.verdictContribution === 'BLOCKED') {
          isBlocked = true;
          if (result.reason) {
            blockedReasons.push(result.reason);
          }
        } else if (result.verdictContribution === 'WARNING') {
          isWarning = true;
          if (result.reason) {
            warnings.push(result.reason);
          }
        }
      }
    }

    if (isBlocked) {
      return {
        verdict: 'BLOCKED',
        primaryReason: blockedReasons[0] ?? 'Security policy violation detected',
        rulesEvaluated,
        blockedReasons,
        warnings,
      };
    }

    if (isWarning) {
      return {
        verdict: 'WARNING',
        primaryReason: warnings[0] ?? 'Degraded evidence detected; proceed with caution',
        rulesEvaluated,
        blockedReasons: [],
        warnings,
      };
    }

    return {
      verdict: 'VERIFIED',
      primaryReason: 'All mandatory checks passed and transaction-request binding verified',
      rulesEvaluated,
      blockedReasons: [],
      warnings: [],
    };
  }
}

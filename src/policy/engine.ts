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

    // Demo Mode: produces explicitly labeled DEMO_VERIFIED state
    if (this.options.provenanceMode === 'DEMO') {
      const isFixtureBacked =
        partialEvidence.contract.provenance === 'LOCAL_FIXTURE' ||
        partialEvidence.intent.provenance === 'LOCAL_FIXTURE' ||
        partialEvidence.simulation.provenance === 'LOCAL_FIXTURE';

      if (isFixtureBacked) {
        return {
          verdict: 'DEMO_VERIFIED',
          primaryReason: 'All mandatory checks passed using local demo fixtures (DEMO ONLY — not live security verification)',
          rulesEvaluated,
          blockedReasons: [],
          warnings: [],
        };
      }
    }

    // Production Mode defense-in-depth: LOCAL_FIXTURE must never reach security-grade VERIFIED
    const hasFixture =
      partialEvidence.contract.provenance === 'LOCAL_FIXTURE' ||
      partialEvidence.intent.provenance === 'LOCAL_FIXTURE' ||
      partialEvidence.simulation.provenance === 'LOCAL_FIXTURE';

    if (hasFixture && this.options.provenanceMode !== 'DEMO') {
      return {
        verdict: 'WARNING',
        primaryReason: 'Degraded evidence: local fixture evidence cannot establish production security-grade VERIFIED',
        rulesEvaluated,
        blockedReasons: [],
        warnings: ['Local fixture evidence cannot establish production security-grade VERIFIED'],
      };
    }

    return {
      verdict: 'VERIFIED',
      primaryReason: 'All mandatory checks passed and transaction-request binding verified with live evidence',
      rulesEvaluated,
      blockedReasons: [],
      warnings: [],
    };
  }
}

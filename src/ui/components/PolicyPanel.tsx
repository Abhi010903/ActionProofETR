import React from 'react';
import type { PolicyEvidence } from '../../evidence/types.js';
import { DETERMINISTIC_POLICY_RULES } from '../../policy/index.js';
import { ScaleIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon } from '../icons.js';

interface PolicyPanelProps {
  policyEvidence?: PolicyEvidence;
  isReady: boolean;
}

// Human-friendly title mappings for the exact implemented rule IDs
const RULE_TITLES: Record<string, string> = {
  RULE_01_REQUEST_BINDING: 'Request Binding Invariant',
  RULE_02A_NO_EXACT_UNLIMITED_APPROVALS: 'No Exact Unlimited Approvals',
  RULE_02B_HIGH_VALUE_APPROVAL_CHECK: 'High-Value Approval Check',
  RULE_03_MULTICALL_CALL_INTEGRITY: 'Multicall Recursive Integrity',
  RULE_04_APPLICATION_INTENT_ALIGNMENT: 'Application Intent Alignment',
  RULE_05_SIMULATION_EXECUTION: 'Simulation Execution Integrity',
  RULE_06_CONTRACT_CORRESPONDENCE: 'Sourcify Bytecode Correspondence',
  RULE_07_CLEAR_SIGNING_DESCRIPTOR: 'ERC-7730 Clear-Signing Descriptor',
  RULE_08_CALLDATA_DECODING_STATUS: 'Calldata Recognizability',
};

export const PolicyPanel: React.FC<PolicyPanelProps> = ({
  policyEvidence,
  isReady,
}) => {
  const evaluatedMap = new Map<string, { passed: boolean; reason?: string; severity: string }>();

  if (policyEvidence?.rulesEvaluated) {
    for (const r of policyEvidence.rulesEvaluated) {
      evaluatedMap.set(r.ruleId, {
        passed: r.passed,
        reason: r.reason,
        severity: r.severity,
      });
    }
  }

  const implementedCount = DETERMINISTIC_POLICY_RULES.length;

  return (
    <section className="soc-panel soc-policy-panel" id="section-policy">
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-tag tag-violet">FORMAL LOGIC GATE</span>
          <h2 className="panel-title">
            Deterministic Policy Engine Audit Log ({implementedCount} Rules)
          </h2>
        </div>
        <div className="panel-header-right">
          <div className="policy-engine-meta">
            <ScaleIcon size={13} color="#a78bfa" />
            <span>
              {implementedCount} RULES &bull; RULE_01, RULE_02A, RULE_02B, RULE_03–RULE_08
            </span>
          </div>
        </div>
      </div>

      <div className="policy-rules-matrix">
        {DETERMINISTIC_POLICY_RULES.map((rule) => {
          let state: 'PENDING' | 'PASS' | 'WARNING' | 'BLOCKED' | 'SKIPPED' = 'PENDING';
          let reason: string | undefined;

          if (isReady) {
            state = 'PENDING';
          } else if (evaluatedMap.has(rule.id)) {
            const evalResult = evaluatedMap.get(rule.id)!;
            if (evalResult.passed) {
              state = 'PASS';
            } else if (evalResult.severity === 'WARNING') {
              state = 'WARNING';
              reason = evalResult.reason;
            } else {
              state = 'BLOCKED';
              reason = evalResult.reason;
            }
          } else {
            state = 'SKIPPED';
          }

          const friendlyTitle = RULE_TITLES[rule.id] ?? rule.id;

          return (
            <div key={rule.id} className={`rule-audit-row rule-${state.toLowerCase()}`}>
              <div className="rule-info-col">
                <div className="rule-title-row">
                  <span className="rule-id mono">{rule.id}</span>
                  <span className="rule-name">{friendlyTitle}</span>
                </div>
                <div className="rule-description">{rule.description}</div>
                {reason && (
                  <div className="rule-violation-detail mono">
                    ↳ VIOLATION: {reason}
                  </div>
                )}
              </div>

              <div className="rule-status-col">
                {state === 'PASS' && (
                  <span className="rule-badge badge-pass">
                    <CheckCircleIcon size={12} color="#34d399" />
                    <span>PASS</span>
                  </span>
                )}
                {state === 'BLOCKED' && (
                  <span className="rule-badge badge-blocked">
                    <XCircleIcon size={12} color="#ef4444" />
                    <span>BLOCKED</span>
                  </span>
                )}
                {state === 'WARNING' && (
                  <span className="rule-badge badge-warning">
                    <AlertTriangleIcon size={12} color="#f59e0b" />
                    <span>WARNING</span>
                  </span>
                )}
                {state === 'PENDING' && (
                  <span className="rule-badge badge-pending">
                    <span>PENDING</span>
                  </span>
                )}
                {state === 'SKIPPED' && (
                  <span className="rule-badge badge-skipped">
                    <span>SKIPPED</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

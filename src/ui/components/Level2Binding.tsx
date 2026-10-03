import React from 'react';
import type { ActionProofResult } from '../../provider/index.js';
import { DEMO_ROUTER, DEMO_ATTACKER } from '../scenarios.js';
import { ShieldLockIcon, LockIcon, UnlockIcon, AlertTriangleIcon } from '../icons.js';

interface Level2BindingProps {
  result: ActionProofResult | null;
  status: 'READY' | 'RUNNING' | 'COMPLETED';
}

export const Level2Binding: React.FC<Level2BindingProps> = ({
  result,
  status,
}) => {
  const isReady = status === 'READY';
  const isRunning = status === 'RUNNING';
  const isMutation = result?.reason === 'COMMITMENT_MISMATCH';
  const isVerified = result?.verdict === 'VERIFIED' || result?.verdict === 'DEMO_VERIFIED';
  const isBlockedAtPolicy = result?.verdict === 'BLOCKED' && !isMutation;
  const isUnsupported = result?.verdict === 'UNSUPPORTED';

  const commitmentA = result?.commitment ?? '0x... [Awaiting Interception]';
  const commitmentB =
    result?.forwardCommitment ??
    (isVerified
      ? result?.commitment ?? '0x...'
      : isBlockedAtPolicy || isUnsupported
      ? '[Forward Snapshot Pre-empted]'
      : '0x... [Awaiting Forward Snapshot]');

  const isMatch = isVerified && !isMutation;
  const isMismatch = isMutation;

  return (
    <section className="soc-panel soc-binding-panel" id="section-binding">
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-tag tag-emerald">LEVEL-2 PROVIDER GATE</span>
          <h2 className="panel-title">Request Binding Cryptographic Invariant</h2>
        </div>
        <div className="panel-header-right">
          <div className="binding-invariant-badge">
            <ShieldLockIcon size={13} color="#10b981" />
            <span>INVARIANT: commitment(verified) &equiv; commitment(forwarded)</span>
          </div>
        </div>
      </div>

      <div className="binding-comparison-wrapper">
        {/* Left Column: Verified Request (Commitment A) */}
        <div className={`binding-box verified-box ${isMismatch ? 'box-threat-contrast' : ''}`}>
          <div className="box-badge-row">
            <span className="box-role text-emerald">VERIFIED REQUEST</span>
            <span className="box-domain mono">actionproof.request.v1</span>
          </div>

          <div className="commitment-display">
            <span className="commitment-label">COMMITMENT A (INITIAL VERIFIED):</span>
            <div className="commitment-hash mono text-emerald" title={commitmentA}>
              {commitmentA}
            </div>
          </div>

          <div className="binding-props">
            <div className="b-prop-row">
              <span className="prop-name">Target Intended:</span>
              <span className="prop-val mono" title={DEMO_ROUTER}>
                {result?.evidence?.transaction.canonical.to ?? DEMO_ROUTER} (Router)
              </span>
            </div>
            <div className="b-prop-row">
              <span className="prop-name">Policy Status:</span>
              <span className="prop-val text-emerald">
                {isReady ? 'PENDING' : isBlockedAtPolicy ? 'FAILED POLICY' : 'PASSED INITIAL POLICY'}
              </span>
            </div>
            <div className="b-prop-row">
              <span className="prop-name">Snapshot Domain:</span>
              <span className="prop-val mono">EIP-712 Canonical Request</span>
            </div>
          </div>
        </div>

        {/* Central Bridge: MATCH vs MISMATCH */}
        <div className="binding-bridge-column">
          {isReady && (
            <div className="bridge-pill bridge-ready">
              <span className="bridge-wire">════════════</span>
              <div className="bridge-center-icon">
                <ShieldLockIcon size={20} color="#60a5fa" />
                <span>STANDBY</span>
              </div>
              <span className="bridge-wire">════════════</span>
            </div>
          )}

          {isRunning && (
            <div className="bridge-pill bridge-running pulse-anim">
              <span className="bridge-wire wire-active">════════════</span>
              <div className="bridge-center-icon">
                <span className="soc-spinner-small"></span>
                <span>RECHECKING</span>
              </div>
              <span className="bridge-wire wire-active">════════════</span>
            </div>
          )}

          {isMatch && (
            <div className="bridge-pill bridge-match">
              <span className="bridge-wire wire-green">═══════════</span>
              <div className="bridge-center-icon match-glow">
                <LockIcon size={20} color="#10b981" />
                <span className="bridge-status-text text-emerald">MATCH</span>
              </div>
              <span className="bridge-wire wire-green">═══════════</span>
              <div className="bridge-subtext text-emerald">REQUEST INTEGRITY 100%</div>
            </div>
          )}

          {isMismatch && (
            <div className="bridge-pill bridge-mismatch">
              <span className="bridge-wire wire-red">═══════</span>
              <div className="bridge-center-icon mismatch-glow">
                <UnlockIcon size={20} color="#ef4444" />
                <span className="bridge-status-text text-crimson">&ne; MISMATCH</span>
              </div>
              <span className="bridge-wire wire-red">═══════</span>
              <div className="bridge-subtext text-crimson">TAMPERING CAUGHT</div>
            </div>
          )}

          {(isBlockedAtPolicy || isUnsupported) && (
            <div className="bridge-pill bridge-preempted">
              <span className="bridge-wire">═══════════</span>
              <div className="bridge-center-icon">
                <AlertTriangleIcon size={18} color="#f59e0b" />
                <span>HALTED</span>
              </div>
              <span className="bridge-wire">═══════════</span>
              <div className="bridge-subtext text-amber">PRE-FORWARD ABORTED</div>
            </div>
          )}
        </div>

        {/* Right Column: Forwarded Request (Commitment B) */}
        <div className={`binding-box forward-box ${isMismatch ? 'box-divergent' : ''}`}>
          <div className="box-badge-row">
            <span className={`box-role ${isMismatch ? 'text-crimson' : isMatch ? 'text-emerald' : 'text-cyan'}`}>
              FORWARDED REQUEST (DISPATCH)
            </span>
            <span className="box-domain mono">pre-forward.snapshot</span>
          </div>

          <div className="commitment-display">
            <span className="commitment-label">COMMITMENT B (PRE-FORWARD RECHECK):</span>
            <div
              className={`commitment-hash mono ${isMismatch ? 'text-crimson' : isMatch ? 'text-emerald' : 'text-cyan'}`}
              title={String(commitmentB)}
            >
              {commitmentB}
            </div>
          </div>

          <div className="binding-props">
            <div className="b-prop-row">
              <span className="prop-name">Target In Memory:</span>
              <span
                className={`prop-val mono ${isMismatch ? 'text-crimson text-bold' : ''}`}
                title={isMismatch ? DEMO_ATTACKER : DEMO_ROUTER}
              >
                {isMismatch ? `${DEMO_ATTACKER} (Attacker!)` : isMatch ? `${DEMO_ROUTER} (Router)` : 'Unmodified'}
              </span>
            </div>
            <div className="b-prop-row">
              <span className="prop-name">Recheck Barrier:</span>
              <span className={`prop-val ${isMismatch ? 'text-crimson' : isMatch ? 'text-emerald' : 'text-muted'}`}>
                {isMismatch ? 'DIVERGENCE TRIPPED' : isMatch ? 'EQUALITY CONFIRMED' : 'Awaiting Gate'}
              </span>
            </div>
            <div className="b-prop-row">
              <span className="prop-name">Forward Status:</span>
              <span className={`prop-val ${isMismatch ? 'text-crimson' : isMatch ? 'text-emerald' : 'text-muted'}`}>
                {isMismatch ? 'FORWARDING ABORTED' : isMatch ? 'DISPATCHED' : 'HELD'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Prominent Halted Banner for Mismatch */}
      {isMismatch && (
        <div className="mismatch-halted-banner">
          <div className="halted-left">
            <div className="halted-sign">⛔ FORWARDING HALTED</div>
            <div className="halted-sub">
              Pre-forward commitment recheck detected cryptographic divergence. Target or payload parameters were altered after verification passed.
            </div>
          </div>
          <div className="halted-stat">
            <span className="halted-count-tag">WALLET REQUESTS: 0</span>
            <span className="halted-guarantee">Underlying provider received nothing</span>
          </div>
        </div>
      )}

      {/* Level-2 Boundary Disclaimer */}
      <div className="binding-notice-footer">
        <span className="notice-icon">🔒</span>
        <span>
          <strong>Level-2 Request Binding Scope:</strong> ActionProof guarantees cryptographic binding between the verified request and the request forwarded to the wallet provider at the EIP-1193 JavaScript proxy boundary. <em>(Level-3: Final signed RLP payload inside hardware/extension enclave is outside MVP boundary.)</em>
        </span>
      </div>
    </section>
  );
};

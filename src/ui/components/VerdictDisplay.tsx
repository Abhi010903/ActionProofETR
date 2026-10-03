import React from 'react';
import type { ActionProofResult } from '../../provider/index.js';
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  AlertTriangleIcon,
  ShieldLockIcon,
} from '../icons.js';

interface VerdictDisplayProps {
  status: 'READY' | 'RUNNING' | 'COMPLETED';
  result: ActionProofResult | null;
  walletTxsCount: number;
}

export const VerdictDisplay: React.FC<VerdictDisplayProps> = ({
  status,
  result,
  walletTxsCount,
}) => {
  const isReady = status === 'READY';
  const isRunning = status === 'RUNNING';
  const isUnsupported = result?.verdict === 'UNSUPPORTED';
  const isBlocked = result?.verdict === 'BLOCKED';
  const isVerified = result?.verdict === 'VERIFIED';
  const isDemoVerified = result?.verdict === 'DEMO_VERIFIED';
  const isWarning = result?.verdict === 'WARNING';
  const isUnknownCalldata = result?.evidence?.decode.status === 'UNKNOWN_CALLDATA';
  const isMutation = result?.reason === 'COMMITMENT_MISMATCH';

  if (isReady) {
    return (
      <div className="soc-verdict-banner verdict-standby">
        <div className="verdict-banner-inner">
          <div className="verdict-icon-container">
            <ShieldLockIcon size={32} color="#60a5fa" />
          </div>
          <div className="verdict-content">
            <div className="verdict-label-row">
              <span className="verdict-category text-cyan">SYSTEM STANDBY</span>
              <span className="verdict-pill pill-standby">READY // UNEXECUTED</span>
            </div>
            <h3 className="verdict-main-heading">
              TRANSACTION STAGED FOR PROVIDER INTERCEPTION
            </h3>
            <p className="verdict-body-text">
              ActionProof provider proxy is listening at the controlled boundary. Transaction request parameters are staged in memory. Click <strong>"INTERCEPT & VERIFY REQUEST"</strong> to evaluate deterministic policy rules and enforce Level-2 request binding.
            </p>
          </div>
          <div className="verdict-boundary-stat">
            <div className="boundary-stat-title">WALLET BOUNDARY</div>
            <div className="boundary-stat-pill pill-zero">
              WALLET REQUESTS: 0
            </div>
            <div className="boundary-stat-desc">Awaiting Gate Verification</div>
          </div>
        </div>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="soc-verdict-banner verdict-evaluating">
        <div className="verdict-banner-inner">
          <div className="verdict-icon-container pulse-icon">
            <span className="soc-spinner-large"></span>
          </div>
          <div className="verdict-content">
            <div className="verdict-label-row">
              <span className="verdict-category text-cyan">ACTIVE INTERCEPTION</span>
              <span className="verdict-pill pill-evaluating">RUNNING PROXY GATE</span>
            </div>
            <h3 className="verdict-main-heading">
              PROCESSING CANONICAL SNAPSHOT & EVIDENCE...
            </h3>
            <p className="verdict-body-text">
              Computing deterministic keccak256 commitment, independently extracting calldata semantics, verifying Sourcify correspondence, and evaluating 9 deterministic security rules (RULE_01 to RULE_08, including RULE_02A &amp; RULE_02B).
            </p>
          </div>
          <div className="verdict-boundary-stat">
            <div className="boundary-stat-title">WALLET BOUNDARY</div>
            <div className="boundary-stat-pill pill-processing">
              HOLDING AT GATE
            </div>
            <div className="boundary-stat-desc">Forwarding Barrier Active</div>
          </div>
        </div>
      </div>
    );
  }

  if (isVerified || isDemoVerified) {
    return (
      <div className="soc-verdict-banner verdict-verified">
        <div className="verdict-banner-inner">
          <div className="verdict-icon-container">
            <div className="icon-glow-green">
              <ShieldCheckIcon size={36} color="#10b981" />
            </div>
          </div>

          <div className="verdict-content">
            <div className="verdict-label-row">
              <span className="verdict-category text-emerald">
                {isDemoVerified ? 'DEMO VERDICT (DETERMINISTIC FIXTURES)' : 'SECURITY VERDICT'}
              </span>
              <span className="verdict-pill pill-verified">
                {isDemoVerified ? 'DEMO_VERIFIED' : 'VERIFIED'}
              </span>
              <span className="verdict-integrity-pill">REQUEST INTEGRITY MATCH</span>
            </div>

            <h3 className="verdict-main-heading text-emerald">
              {isDemoVerified
                ? '✓ DEMO TRANSACTION VERIFIED • FORWARDED TO MOCK WALLET'
                : '✓ TRANSACTION VERIFIED • FORWARD TO WALLET'}
            </h3>

            <div className="verdict-meta-row">
              <span className="meta-tag">
                Primary Reason: <strong>{result?.evidence?.policy.primaryReason ?? (isDemoVerified ? 'Deterministic fixture checks passed and Level-2 provider binding established' : 'Mandatory supported checks passed and Level-2 provider binding established')}</strong>
              </span>
            </div>

            <div className="verdict-proof-grid">
              <div className="proof-box proof-guarantees">
                <span className="proof-label text-emerald">
                  {isDemoVerified ? '✓ WHAT DEMO_VERIFIED PROVES:' : '✓ WHAT VERIFIED PROVES:'}
                </span>
                <p>
                  {isDemoVerified
                    ? 'Deterministic local fixture checks passed, calldata decoded cleanly, policy rules passed, and Level-2 provider binding is established (the immutable forwarded request is canonical-equivalent to the verified commitment).'
                    : 'Mandatory supported deterministic checks passed, evidence checks passed, and Level-2 provider binding is established (the immutable forwarded transaction request snapshot is canonical-equivalent to the verified commitment under actionproof.request.v1).'}
                </p>
              </div>
              <div className="proof-box proof-limits">
                <span className="proof-label text-cyan">
                  {isDemoVerified ? 'ℹ PROVENANCE NOTICE (M4):' : 'ℹ WHAT VERIFIED DOES NOT PROVE:'}
                </span>
                <p>
                  {isDemoVerified
                    ? 'Evidence is backed by local fixtures (LOCAL_FIXTURE), NOT live external verification. Under production security policy, fixture evidence yields WARNING to prevent ungrounded claims. This demo proves pipeline mechanics, request binding, and deterministic policy evaluation.'
                    : 'Does not guarantee the smart contract is free of bugs or economically safe; simulation is evaluated via a deterministic local fixture (not live EVM execution); does not guarantee the wallet will sign identical bytes (Level-3 final signed RLP payload is outside MVP boundary).'}
                </p>
              </div>
            </div>
          </div>

          <div className="verdict-boundary-stat">
            <div className="boundary-stat-title">WALLET BOUNDARY</div>
            <div className="boundary-stat-pill pill-forwarded">
              FORWARDED: 1 REQUEST
            </div>
            {result?.txHash && (
              <div className="boundary-tx-hash mono text-cyan" title={result.txHash}>
                TX: {result.txHash.slice(0, 14)}...
              </div>
            )}
            <div className="boundary-stat-desc">Dispatched via EIP-1193</div>
          </div>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className={`soc-verdict-banner ${isMutation ? 'verdict-mutation' : 'verdict-blocked'}`}>
        <div className="verdict-banner-inner">
          <div className="verdict-icon-container">
            <div className="icon-glow-red">
              <ShieldAlertIcon size={36} color="#ef4444" />
            </div>
          </div>

          <div className="verdict-content">
            <div className="verdict-label-row">
              <span className="verdict-category text-crimson">SECURITY VERDICT</span>
              <span className="verdict-pill pill-blocked">
                {isUnknownCalldata ? 'UNVERIFIABLE / BLOCKED' : isMutation ? 'MUTATION / BLOCKED' : 'BLOCKED'}
              </span>
              <span className="verdict-halted-pill">FORWARDING HALTED</span>
            </div>

            <h3 className="verdict-main-heading text-crimson">
              ⛔ TRANSACTION BLOCKED
            </h3>

            <div className="verdict-reason-panel">
              <div className="reason-header">REASON:</div>
              <div className="reason-text mono">
                {result?.reason ?? result?.evidence?.policy.primaryReason ?? 'Policy violation detected'}
              </div>
              {result?.detail && (
                <div className="reason-detail mono">{result.detail}</div>
              )}
            </div>

            {isUnknownCalldata && (
              <div className="verdict-failclosed-callout">
                <strong>FAIL-CLOSED DEFENSE PRINCIPLE:</strong> ActionProof cannot verify what it cannot decode. "No known malicious behavior detected" is NOT the same as "verified safe".
              </div>
            )}

            {isMutation && (
              <div className="verdict-failclosed-callout">
                <strong>LEVEL-2 PROVIDER BINDING BARRIER:</strong> Detected in-memory transaction mutation after verification completed. Forwarding aborted to prevent malicious diversion.
              </div>
            )}
          </div>

          <div className="verdict-boundary-stat">
            <div className="boundary-stat-title">WALLET BOUNDARY</div>
            <div className="boundary-stat-pill pill-halted">
              WALLET REQUESTS: 0
            </div>
            <div className="boundary-stat-desc text-crimson">
              100% PRE-FORWARD ISOLATION
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isUnsupported) {
    return (
      <div className="soc-verdict-banner verdict-unsupported">
        <div className="verdict-banner-inner">
          <div className="verdict-icon-container">
            <div className="icon-glow-purple">
              <AlertTriangleIcon size={36} color="#a855f7" />
            </div>
          </div>

          <div className="verdict-content">
            <div className="verdict-label-row">
              <span className="verdict-category text-violet">SCOPE BOUNDARY</span>
              <span className="verdict-pill pill-unsupported">UNSUPPORTED</span>
              <span className="verdict-halted-pill">FAIL-CLOSED ENFORCEMENT</span>
            </div>

            <h3 className="verdict-main-heading text-violet">
              ⚠ UNSUPPORTED TRANSACTION
            </h3>

            <div className="verdict-reason-panel panel-purple">
              <div className="reason-header">REASON:</div>
              <div className="reason-text mono">{result?.reason}</div>
              {result?.detail && (
                <div className="reason-detail mono">{result.detail}</div>
              )}
            </div>

            <p className="verdict-body-text" style={{ marginTop: '8px' }}>
              ActionProof maintains a strictly frozen canonical schema (<strong>actionproof.request.v1</strong>). Transactions utilizing features outside this boundary (e.g. EIP-7702 authorizationList or alternative write RPCs) are rejected at canonicalization. <em>Not labeled malicious; explicitly marked unsupported.</em>
            </p>
          </div>

          <div className="verdict-boundary-stat">
            <div className="boundary-stat-title">WALLET BOUNDARY</div>
            <div className="boundary-stat-pill pill-halted">
              WALLET REQUESTS: 0
            </div>
            <div className="boundary-stat-desc text-violet">
              REJECTED AT SCHEMA
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isWarning) {
    return (
      <div className="soc-verdict-banner verdict-warning" style={{ borderColor: '#f59e0b' }}>
        <div className="verdict-banner-inner">
          <div className="verdict-icon-container">
            <div className="icon-glow-amber">
              <AlertTriangleIcon size={36} color="#f59e0b" />
            </div>
          </div>

          <div className="verdict-content">
            <div className="verdict-label-row">
              <span className="verdict-category" style={{ color: '#f59e0b' }}>POLICY WARNING</span>
              <span className="verdict-pill badge-warning">WARNING</span>
              <span className="verdict-halted-pill" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', borderColor: '#f59e0b' }}>
                DEGRADED EVIDENCE
              </span>
            </div>

            <h3 className="verdict-main-heading" style={{ color: '#f59e0b' }}>
              ⚠ TRANSACTION WARNING • DEGRADED EVIDENCE
            </h3>

            <div className="verdict-reason-panel" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
              <div className="reason-header">REASON:</div>
              <div className="reason-text mono">
                {result?.reason ?? result?.evidence?.policy.primaryReason ?? 'Degraded evidence or policy warning'}
              </div>
              {result?.detail && (
                <div className="reason-detail mono">{result.detail}</div>
              )}
            </div>

            <p className="verdict-body-text" style={{ marginTop: '8px' }}>
              ActionProof fail-closed principle: degraded or fixture evidence cannot establish security-grade verification. Forwarding is held at the provider boundary unless explicit confirmation is provided.
            </p>
          </div>

          <div className="verdict-boundary-stat">
            <div className="boundary-stat-title">WALLET BOUNDARY</div>
            <div className="boundary-stat-pill pill-halted">
              WALLET REQUESTS: {walletTxsCount}
            </div>
            <div className="boundary-stat-desc" style={{ color: '#f59e0b' }}>
              FAIL-CLOSED HOLD
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

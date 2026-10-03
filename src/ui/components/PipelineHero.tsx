import React from 'react';
import type { ActionProofResult } from '../../provider/index.js';
import type { DemoScenario } from '../scenarios.js';
import {
  CheckCircleIcon,
  XCircleIcon,
  ShieldLockIcon,
  ActivityIcon,
} from '../icons.js';

interface PipelineHeroProps {
  status: 'READY' | 'RUNNING' | 'COMPLETED';
  result: ActionProofResult | null;
  selectedScenario: DemoScenario;
}

export type StageState = 'ready' | 'running' | 'ok' | 'fail' | 'mismatch' | 'skipped';

export interface PipelineStage {
  id: string;
  number: number;
  name: string;
  subtitle: string;
  state: StageState;
  badge: string;
  detail: string;
  subtext?: string;
}

export const PipelineHero: React.FC<PipelineHeroProps> = ({
  status,
  result,
  selectedScenario,
}) => {
  const isReady = status === 'READY';
  const isRunning = status === 'RUNNING';
  const isUnsupported = result?.verdict === 'UNSUPPORTED';
  const isBlocked = result?.verdict === 'BLOCKED';
  const isVerified = result?.verdict === 'VERIFIED' || result?.verdict === 'DEMO_VERIFIED';
  const isMutation = result?.reason === 'COMMITMENT_MISMATCH';
  const isUnknownCalldata = result?.evidence?.decode.status === 'UNKNOWN_CALLDATA';

  // 1. CAPTURE
  const s1State: StageState = isReady ? 'ready' : isRunning ? 'running' : 'ok';
  const s1Badge = isReady ? 'STANDBY' : isRunning ? 'CAPTURING' : 'CAPTURED';
  const s1Detail = isReady ? selectedScenario.method : `${selectedScenario.method}`;
  const s1Sub = isReady ? 'EIP-1193 Gateway' : 'Snapshot Frozen';

  // 2. VALIDATE
  const s2State: StageState = isReady
    ? 'ready'
    : isRunning
    ? 'running'
    : isUnsupported
    ? 'fail'
    : 'ok';
  const s2Badge = isReady
    ? 'STANDBY'
    : isRunning
    ? 'VALIDATING'
    : isUnsupported
    ? 'REJECTED'
    : 'VALIDATED';
  const s2Detail = isReady
    ? 'actionproof.request.v1'
    : isUnsupported
    ? (result?.reason ?? 'Schema Error')
    : 'Schema Compliant';
  const s2Sub = isUnsupported ? 'Out of MVP Scope' : 'Shape Verified';

  // 3. CANONICALIZE
  const s3State: StageState = isReady
    ? 'ready'
    : isRunning
    ? 'running'
    : isUnsupported
    ? 'skipped'
    : 'ok';
  const s3Badge = isReady
    ? 'STANDBY'
    : isRunning
    ? 'NORMALIZING'
    : isUnsupported
    ? 'PRE-EMPTED'
    : 'NORMALIZED';
  const s3Detail = isReady
    ? 'Deterministic Sorting'
    : isUnsupported
    ? 'Bypassed'
    : 'RFC-8785 Canonical JSON';
  const s3Sub = 'Domain Bound';

  // 4. COMMIT
  const s4State: StageState = isReady
    ? 'ready'
    : isRunning
    ? 'running'
    : isUnsupported
    ? 'skipped'
    : 'ok';
  const s4Badge = isReady
    ? 'STANDBY'
    : isRunning
    ? 'HASHING'
    : isUnsupported
    ? 'PRE-EMPTED'
    : 'COMMITTED';
  const s4Detail = isReady
    ? 'keccak256(canonical)'
    : isUnsupported
    ? 'None Generated'
    : result?.commitment
    ? `${result.commitment.slice(0, 10)}...`
    : 'Computing Hash';
  const s4Sub = 'Commitment A';

  // 5. EVIDENCE
  const s5State: StageState = isReady
    ? 'ready'
    : isRunning
    ? 'running'
    : isUnsupported
    ? 'skipped'
    : 'ok';
  const s5Badge = isReady
    ? 'STANDBY'
    : isRunning
    ? 'QUERYING'
    : isUnsupported
    ? 'PRE-EMPTED'
    : 'GATHERED';
  const s5Detail = isReady
    ? 'ABI, Sourcify, 7730, Sim'
    : isUnsupported
    ? 'Bypassed'
    : '4 Domains Extracted';
  const s5Sub = result?.evidence?.decode.status ?? 'Deterministic Extract';

  // 6. POLICY
  const s6State: StageState = isReady
    ? 'ready'
    : isRunning
    ? 'running'
    : isUnsupported
    ? 'skipped'
    : isBlocked && !isMutation
    ? 'fail'
    : 'ok';
  const s6Badge = isReady
    ? 'STANDBY'
    : isRunning
    ? 'EVALUATING'
    : isUnsupported
    ? 'PRE-EMPTED'
    : isBlocked && !isMutation
    ? 'FATAL_VIOLATION'
    : 'PASSED';
  const s6Detail = isReady
    ? '9 Deterministic Rules'
    : isUnsupported
    ? 'Bypassed'
    : isUnknownCalldata
    ? 'Fail-Closed Calldata'
    : isBlocked && !isMutation
    ? (result?.reason ?? 'Rule Failed')
    : 'All Rules Cleared';
  const s6Sub = 'Zero LLM Authority';

  // 7. PRE-FORWARD RECHECK
  const s7State: StageState = isReady
    ? 'ready'
    : isRunning
    ? 'running'
    : isUnsupported || (isBlocked && !isMutation)
    ? 'skipped'
    : 'ok';
  const s7Badge = isReady
    ? 'STANDBY'
    : isRunning
    ? 'RECHECKING'
    : isUnsupported || (isBlocked && !isMutation)
    ? 'PRE-EMPTED'
    : 'RECHECKED';
  const s7Detail = isReady
    ? 'Pre-Forward Snapshot'
    : isUnsupported || (isBlocked && !isMutation)
    ? 'Gate Aborted'
    : 'Forward Snapshot Taken';
  const s7Sub = 'Anti-Tamper Barrier';

  // 8. COMMITMENT MATCH
  const s8State: StageState = isReady
    ? 'ready'
    : isRunning
    ? 'running'
    : isUnsupported || (isBlocked && !isMutation)
    ? 'skipped'
    : isMutation
    ? 'mismatch'
    : 'ok';
  const s8Badge = isReady
    ? 'STANDBY'
    : isRunning
    ? 'VERIFYING'
    : isUnsupported || (isBlocked && !isMutation)
    ? 'PRE-EMPTED'
    : isMutation
    ? 'MISMATCH'
    : 'MATCH';
  const s8Detail = isReady
    ? 'Commitment A == B'
    : isMutation
    ? 'Hash Diverged'
    : isVerified
    ? 'Equality Verified'
    : 'Not Rechecked';
  const s8Sub = isMutation ? 'Tampering Detected' : 'Cryptographic Proof';

  // 9. FORWARDED / BLOCKED
  const s9State: StageState = isReady
    ? 'ready'
    : isRunning
    ? 'running'
    : result?.blockedBeforeForwarding
    ? 'fail'
    : 'ok';
  const s9Badge = isReady
    ? 'PENDING'
    : isRunning
    ? 'DISPATCHING'
    : result?.blockedBeforeForwarding
    ? 'BLOCKED'
    : 'FORWARDED';
  const s9Detail = isReady
    ? 'Wallet: 0 Requests'
    : result?.blockedBeforeForwarding
    ? 'Halted (Wallet: 0)'
    : 'Dispatched to Wallet';
  const s9Sub = result?.txHash ? `TX: ${result.txHash.slice(0, 10)}...` : 'Terminal Barrier';

  const stages: PipelineStage[] = [
    { id: 'capture', number: 1, name: 'CAPTURE', subtitle: 'EIP-1193 Gateway', state: s1State, badge: s1Badge, detail: s1Detail, subtext: s1Sub },
    { id: 'validate', number: 2, name: 'VALIDATE', subtitle: 'Schema & Shape', state: s2State, badge: s2Badge, detail: s2Detail, subtext: s2Sub },
    { id: 'canonicalize', number: 3, name: 'CANONICALIZE', subtitle: 'Key Sorting & Norm', state: s3State, badge: s3Badge, detail: s3Detail, subtext: s3Sub },
    { id: 'commit', number: 4, name: 'COMMIT', subtitle: 'Commitment A', state: s4State, badge: s4Badge, detail: s4Detail, subtext: s4Sub },
    { id: 'evidence', number: 5, name: 'EVIDENCE', subtitle: 'Multi-Domain Model', state: s5State, badge: s5Badge, detail: s5Detail, subtext: s5Sub },
    { id: 'policy', number: 6, name: 'POLICY', subtitle: 'Deterministic Engine', state: s6State, badge: s6Badge, detail: s6Detail, subtext: s6Sub },
    { id: 'recheck', number: 7, name: 'PRE-FORWARD RECHECK', subtitle: 'Forward Snapshot', state: s7State, badge: s7Badge, detail: s7Detail, subtext: s7Sub },
    { id: 'match', number: 8, name: 'COMMITMENT MATCH', subtitle: 'Equality Invariant', state: s8State, badge: s8Badge, detail: s8Detail, subtext: s8Sub },
    { id: 'terminal', number: 9, name: isVerified ? 'FORWARDED' : 'BLOCKED', subtitle: 'Terminal Gate', state: s9State, badge: s9Badge, detail: s9Detail, subtext: s9Sub },
  ];

  return (
    <section className="soc-panel soc-pipeline-hero" id="section-pipeline">
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-tag tag-cyan">SOC VERIFICATION ENGINE</span>
          <h2 className="panel-title">Live 9-Stage Verification Pipeline</h2>
        </div>
        <div className="panel-header-right">
          <div className="pipeline-mode-pill">
            <ActivityIcon size={12} color="#38bdf8" />
            <span>REAL RUNTIME PATH &bull; NO SIMULATED DELAYS</span>
          </div>
        </div>
      </div>

      {/* Hero Pipeline Node Sequence */}
      <div className="pipeline-flow-container">
        {stages.map((st, idx) => {
          const isLast = idx === stages.length - 1;
          const statusClass = `stage-${st.state}`;
          const isNodeActive = st.state === 'running' || st.state === 'ok';

          return (
            <React.Fragment key={st.id}>
              <div className={`pipeline-stage-card ${statusClass} ${st.state === 'running' ? 'pulse-anim' : ''}`}>
                <div className="stage-top-meta">
                  <span className="stage-num">0{st.number}</span>
                  <span className={`stage-state-badge badge-${st.state}`}>
                    {st.state === 'ok' && <CheckCircleIcon size={10} color="currentColor" />}
                    {st.state === 'fail' && <XCircleIcon size={10} color="currentColor" />}
                    {st.state === 'mismatch' && <ShieldLockIcon size={10} color="currentColor" />}
                    <span>{st.badge}</span>
                  </span>
                </div>

                <div className="stage-title">{st.name}</div>
                <div className="stage-subtitle">{st.subtitle}</div>

                <div className="stage-data-block">
                  <div className="stage-detail-text mono" title={st.detail}>
                    {st.detail}
                  </div>
                  {st.subtext && <div className="stage-subtext">{st.subtext}</div>}
                </div>

                {/* Subtle active status light indicator */}
                <div className="stage-card-indicator">
                  <span className={`indicator-dot dot-${st.state}`}></span>
                </div>
              </div>

              {!isLast && (
                <div className={`pipeline-connector ${st.state === 'ok' ? 'conn-ok' : st.state === 'fail' || st.state === 'mismatch' ? 'conn-fail' : isRunning ? 'conn-running' : 'conn-idle'}`}>
                  <div className="connector-line"></div>
                  <div className="connector-arrow">&rsaquo;</div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
};

import React, { useState, useMemo, useSyncExternalStore } from 'react';
import {
  DEMO_SCENARIOS,
  DEMO_ROUTER,
  DEMO_ATTACKER,
  type DemoScenario,
} from './scenarios.js';
import { DemoRunner } from './runner.js';
import type { CallTreeNode } from '../evidence/types.js';

export function App() {
  const runner = useMemo(() => new DemoRunner(), []);
  const state = useSyncExternalStore(runner.subscribe.bind(runner), () => runner.state);

  const {
    selectedScenario,
    status,
    result,
    walletTxs,
    executionCount,
    lastExecutionTimestamp,
  } = state;

  const isRunning = status === 'RUNNING';
  const isReady = status === 'READY';

  const [showJson, setShowJson] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Derived state for the 6-stage runtime pipeline trace
  const isUnsupported = result?.verdict === 'UNSUPPORTED';
  const isBlocked = result?.verdict === 'BLOCKED';
  const isVerified = result?.verdict === 'VERIFIED';
  const isMutation = result?.reason === 'COMMITMENT_MISMATCH';
  const isUnknownCalldata = result?.evidence?.decode.status === 'UNKNOWN_CALLDATA';

  const stage1Status = isReady ? 'skipped' : 'ok';
  const stage2Status = isReady ? 'skipped' : isUnsupported ? 'fail' : 'ok';
  const stage3Status = isReady ? 'skipped' : isUnsupported ? 'skipped' : result?.evidence ? 'ok' : 'skipped';
  const stage4Status = isReady ? 'skipped' : isUnsupported ? 'skipped' : isBlocked && !isMutation ? 'fail' : isVerified || isMutation ? 'ok' : 'skipped';
  const stage5Status = isReady ? 'skipped' : isUnsupported || (isBlocked && !isMutation) ? 'skipped' : isMutation ? 'mismatch' : isVerified ? 'ok' : 'skipped';
  const stage6Status = isReady ? 'skipped' : result?.blockedBeforeForwarding ? 'fail' : 'ok';

  const primaryScenarios = DEMO_SCENARIOS.slice(0, 5);
  const advancedScenarios = DEMO_SCENARIOS.slice(5);

  const renderCallTreeNodes = (nodes: CallTreeNode[]) => {
    return (
      <div className="call-tree-list">
        {nodes.map((node, i) => (
          <div key={i} className={`call-node ${node.isDangerous ? 'dangerous' : ''}`}>
            <div className="call-header">
              <span style={{ color: node.isDangerous ? '#f87171' : '#60a5fa', fontWeight: 'bold' }}>
                {node.depth > 0 ? '↳ Subcall: ' : 'Call: '}
                {node.functionName}
              </span>
              {node.isDangerous && (
                <span className="card-status status-danger">DANGEROUS ACTION</span>
              )}
            </div>
            <div className="field-row">
              <span className="field-label">Target:</span>
              <span className="field-value mono">{node.target}</span>
            </div>
            {node.dangerReason && (
              <div style={{ color: '#f87171', fontSize: '11px', marginTop: '4px', fontWeight: 600 }}>
                ⚠ {node.dangerReason}
              </div>
            )}
            <div className="call-args mono">
              Args: {JSON.stringify(node.args)}
            </div>
            {node.children && node.children.length > 0 && (
              <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid #334155' }}>
                {renderCallTreeNodes(node.children)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const stagedReq = selectedScenario.getRequest() as Record<string, unknown>;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div>
          <div className="header-title">
            <span>🛡️ ActionProof</span>
            <span className="header-badge">EIP-1193 Pre-Signing Gate</span>
          </div>
          <p className="header-subtitle">
            Controlled EIP-1193 Transaction-Request Binding & Evidence Verification Engine
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="security-level-pill">
              <span>🔒 Level-2 Request Binding</span>
              <span style={{ color: '#9ca3af', fontSize: '11px' }}>(L3 Final Signed Payload: Outside MVP)</span>
            </div>
            <button
              className="reset-btn"
              onClick={() => runner.resetDemo()}
              title="Reset mock wallet transaction history and return to unexecuted READY state"
            >
              🔄 Reset Demo State
            </button>
          </div>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Controlled Provider Boundary Integration</span>
        </div>
      </header>

      {/* Primary Evaluator Scenarios */}
      <section className="scenario-section">
        <div className="section-title">
          <span>🧪 5 Primary Evaluator Demo Scenarios</span>
          <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 'normal' }}>
            (Select a scenario to stage; click "Intercept & Verify Request" to execute live through ActionProof)
          </span>
        </div>
        <div className="scenario-buttons">
          {primaryScenarios.map((sc) => {
            const isActive = sc.id === selectedScenario.id;
            return (
              <button
                key={sc.id}
                className={`scenario-btn ${isActive ? 'active' : ''}`}
                onClick={() => runner.selectScenario(sc)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="scenario-btn-name">{sc.name}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      background:
                        sc.category === 'NORMAL'
                          ? '#064e3b'
                          : sc.category === 'ATTACK'
                          ? '#7f1d1d'
                          : sc.category === 'MUTATION'
                          ? '#78350f'
                          : sc.category === 'UNVERIFIABLE'
                          ? '#581c87'
                          : sc.category === 'UNSUPPORTED'
                          ? '#4c1d95'
                          : '#1e293b',
                      color: '#fff',
                    }}
                  >
                    {sc.category}
                  </span>
                </div>
                <span className="scenario-btn-desc">{sc.shortDescription}</span>
              </button>
            );
          })}
        </div>

        {/* Toggle Additional Scenarios */}
        <div style={{ marginBottom: '14px' }}>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#60a5fa',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
              padding: 0,
            }}
          >
            {showAdvanced ? '▲ Hide' : '▼ Show'} Additional Security & Boundary Scenarios (Scenarios 6–9)
          </button>
          {showAdvanced && (
            <div className="scenario-buttons" style={{ marginTop: '12px' }}>
              {advancedScenarios.map((sc) => {
                const isActive = sc.id === selectedScenario.id;
                return (
                  <button
                    key={sc.id}
                    className={`scenario-btn ${isActive ? 'active' : ''}`}
                    onClick={() => runner.selectScenario(sc)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="scenario-btn-name">{sc.name}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          background:
                            sc.category === 'MUTATION'
                              ? '#78350f'
                              : sc.category === 'UNSUPPORTED'
                              ? '#4c1d95'
                              : '#1e293b',
                          color: '#fff',
                        }}
                      >
                        {sc.category}
                      </span>
                    </div>
                    <span className="scenario-btn-desc">{sc.shortDescription}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="action-bar">
          <div style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '780px' }}>
            <strong style={{ color: '#cbd5e1' }}>Scenario Analysis: </strong>
            {selectedScenario.explanation}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {executionCount > 0 && lastExecutionTimestamp && (
              <div className="execution-stamp">
                <span style={{ fontWeight: 700, color: '#e2e8f0' }}>Execution #{executionCount}</span>
                <span style={{ color: '#64748b' }}>Executed via ActionProof Provider Proxy</span>
                <span className="mono" style={{ color: '#38bdf8' }}>{lastExecutionTimestamp}</span>
              </div>
            )}
            <button
              className="dispatch-btn"
              disabled={isRunning}
              onClick={() => runner.execute()}
              style={{
                background: executionCount === 0 ? '#059669' : '#2563eb',
              }}
            >
              {isRunning
                ? '⏳ Verifying via Proxy...'
                : executionCount === 0
                ? '🛡️ Intercept & Verify Request'
                : '🔄 Re-Execute Gate'}
            </button>
          </div>
        </div>
      </section>

      {/* Staged Request Preview Card (shown in READY state before execution) */}
      {isReady && (
        <section className="staged-preview-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span className="section-title" style={{ margin: 0, fontSize: '14px', color: '#93c5fd' }}>
              📋 Staged DApp Request (Ready for Provider Interception)
            </span>
            <span className="provenance-tag prov-unavailable">UNVERIFIED DAPP PAYLOAD</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div className="field-row">
              <span className="field-label">Target Contract (to):</span>
              <span className="field-value mono">{String(stagedReq.to ?? 'None')}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Origin Sender (from):</span>
              <span className="field-value mono">{String(stagedReq.from ?? 'None')}</span>
            </div>
            <div className="field-row">
              <span className="field-label">RPC Method:</span>
              <span className="field-value mono">{selectedScenario.method}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Declared Claim:</span>
              <span className="field-value" style={{ color: '#38bdf8', fontWeight: 600 }}>"{selectedScenario.declaredAction}"</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #1e293b' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Transaction request is staged in memory. Click the button to run the real ActionProof security gate.
            </span>
            <button
              className="dispatch-btn"
              onClick={() => runner.execute()}
              style={{ background: '#059669', fontSize: '13px', padding: '8px 16px' }}
            >
              🛡️ Intercept & Verify Request
            </button>
          </div>
        </section>
      )}

      {/* Real Runtime Pipeline Execution Trace */}
      <section className="pipeline-trace-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="section-title" style={{ margin: 0 }}>
            🛰️ Real Runtime Pipeline Trace (Live Execution Path)
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Derived directly from proxy execution; zero simulated animation
          </span>
        </div>
        <div className="pipeline-steps">
          {/* Step 1 */}
          <div className={`pipeline-step step-${stage1Status}`}>
            <span className="step-num">Step 1: Interception</span>
            <span className="step-name">Request Captured</span>
            <span className="step-detail mono">{selectedScenario.method}</span>
            <span className={`step-badge step-badge-${stage1Status}`}>
              {isReady ? 'READY' : 'CAPTURED'}
            </span>
          </div>

          {/* Step 2 */}
          <div className={`pipeline-step step-${stage2Status}`}>
            <span className="step-num">Step 2: Canonicalize</span>
            <span className="step-name">Schema & Commit A</span>
            <span className="step-detail mono">
              {isReady
                ? 'Pending'
                : isUnsupported
                ? 'Schema Rejection'
                : `${result?.commitment?.slice(0, 10) ?? 'Computing'}...`}
            </span>
            <span className={`step-badge step-badge-${stage2Status}`}>
              {isReady ? 'READY' : isUnsupported ? 'REJECTED' : 'COMMITTED'}
            </span>
          </div>

          {/* Step 3 */}
          <div className={`pipeline-step step-${stage3Status}`}>
            <span className="step-num">Step 3: Evidence</span>
            <span className="step-name">Evidence Pipeline</span>
            <span className="step-detail">
              {isReady ? 'Pending' : stage3Status === 'skipped' ? 'Pre-empted' : '4 Modules Queried'}
            </span>
            <span className={`step-badge step-badge-${stage3Status}`}>
              {isReady ? 'READY' : stage3Status === 'skipped' ? 'SKIPPED' : 'COLLECTED'}
            </span>
          </div>

          {/* Step 4 */}
          <div className={`pipeline-step step-${stage4Status}`}>
            <span className="step-num">Step 4: Deterministic</span>
            <span className="step-name">Policy Engine</span>
            <span className="step-detail">
              {isReady
                ? 'Pending'
                : isUnknownCalldata
                ? 'Fail-Closed Calldata'
                : stage4Status === 'fail'
                ? 'Fatal Rule Violation'
                : stage4Status === 'ok'
                ? '8/8 Rules Passed'
                : 'Pre-empted'}
            </span>
            <span className={`step-badge step-badge-${stage4Status}`}>
              {isReady ? 'READY' : stage4Status === 'ok' ? 'PASSED' : stage4Status === 'fail' ? 'BLOCKED' : 'SKIPPED'}
            </span>
          </div>

          {/* Step 5 */}
          <div className={`pipeline-step step-${stage5Status}`}>
            <span className="step-num">Step 5: Pre-Forward</span>
            <span className="step-name">Level-2 Recheck</span>
            <span className="step-detail mono">
              {isReady
                ? 'Pending'
                : isMutation
                ? 'Hash Diverged'
                : stage5Status === 'ok'
                ? 'Commitment B Match'
                : 'Not Executed'}
            </span>
            <span className={`step-badge step-badge-${stage5Status}`}>
              {isReady
                ? 'READY'
                : stage5Status === 'ok'
                ? 'MATCH'
                : stage5Status === 'mismatch'
                ? 'MISMATCH'
                : 'SKIPPED'}
            </span>
          </div>

          {/* Step 6 */}
          <div className={`pipeline-step step-${stage6Status}`}>
            <span className="step-num">Step 6: Boundary Gate</span>
            <span className="step-name">Wallet Dispatch</span>
            <span className="step-detail">
              {isReady
                ? '0 Requests (Pending)'
                : stage6Status === 'ok'
                ? '1 Request Received'
                : '0 Requests Received'}
            </span>
            <span className={`step-badge step-badge-${stage6Status}`}>
              {isReady ? 'PENDING' : stage6Status === 'ok' ? 'FORWARDED' : 'BLOCKED'}
            </span>
          </div>
        </div>
      </section>

      {/* Ready / Unexecuted State Banner */}
      {isReady && !isRunning && (
        <div className="verdict-banner verdict-READY">
          <div>
            <div className="verdict-title">
              <span>Security Gate Status:</span>
              <span className="verdict-badge badge-READY">READY / UNEXECUTED</span>
            </div>
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#e5e7eb' }}>
              <strong>Staged Transaction Request: </strong>
              DApp has staged <code className="mono">{selectedScenario.method}</code> with declared claim: <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>"{selectedScenario.declaredAction}"</span>
            </p>
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
              ActionProof provider proxy is active. Click <strong>"🛡️ Intercept & Verify Request"</strong> to execute the full verification pipeline and enforce Level-2 request binding.
            </p>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px', textAlign: 'right' }}>
              Wallet Provider Boundary
            </div>
            <div className="forwarding-status-pill forwarding-PENDING">
              ⏸ PENDING GATE EXECUTION (WALLET RECEIVED 0 REQUESTS)
            </div>
          </div>
        </div>
      )}

      {/* Running State Banner */}
      {isRunning && (
        <div className="verdict-banner verdict-RUNNING">
          <div>
            <div className="verdict-title">
              <span>Security Gate Status:</span>
              <span className="verdict-badge badge-RUNNING">RUNNING...</span>
            </div>
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#e5e7eb' }}>
              Capturing immutable snapshot, computing canonical commitment, evaluating independent evidence, and enforcing policy rules...
            </p>
          </div>
          <div>
            <div className="forwarding-status-pill" style={{ background: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb' }}>
              ⚡ PROCESSING VIA PROXY...
            </div>
          </div>
        </div>
      )}

      {/* Completed Verdict Banner */}
      {result && (
        <div className={`verdict-banner verdict-${isUnknownCalldata ? 'UNVERIFIABLE' : result.verdict}`}>
          <div>
            <div className="verdict-title">
              <span>Security Verdict:</span>
              <span className={`verdict-badge badge-${isUnknownCalldata ? 'UNVERIFIABLE' : result.verdict}`}>
                {isUnknownCalldata ? 'UNVERIFIABLE / BLOCKED' : result.verdict}
              </span>
            </div>
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#e5e7eb' }}>
              <strong>Primary Reason: </strong>
              {result.verdict === 'VERIFIED'
                ? 'VERIFIED — mandatory supported checks passed and Level-2 provider binding established.'
                : result.reason ?? result.evidence?.policy.primaryReason ?? 'Request verified under canonical schema'}
            </p>
            {result.detail && (
              <p style={{ marginTop: '4px', fontSize: '12px', color: '#9ca3af' }} className="mono">
                {result.detail}
              </p>
            )}
            {isUnknownCalldata && (
              <p style={{ marginTop: '6px', fontSize: '12px', color: '#fca5a5', fontWeight: 600 }}>
                ℹ ActionProof cannot verify what it cannot decode. "No known malicious behavior detected" is NOT the same as "verified safe".
              </p>
            )}
            {result.verdict === 'VERIFIED' && (
              <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '12px', color: '#d1fae5' }}>
                <div><strong>What VERIFIED Proves:</strong> Mandatory supported deterministic checks passed, evidence checks passed, and Level-2 provider binding is established (the immutable forwarded transaction request snapshot is canonical-equivalent to the verified commitment under actionproof.request.v1).</div>
                <div style={{ marginTop: '4px', color: '#a7f3d0', fontSize: '11px' }}><strong>What VERIFIED Does NOT Prove:</strong> Does not guarantee the smart contract is free of bugs or economically safe; simulation is evaluated via a deterministic local fixture (not live EVM execution); does not guarantee the wallet will sign identical bytes (Level-3 final signed RLP payload is outside MVP boundary).</div>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px', textAlign: 'right' }}>
              Wallet Provider Boundary
            </div>
            <div className={`forwarding-status-pill forwarding-${result.blockedBeforeForwarding ? 'NO' : 'YES'}`}>
              {result.blockedBeforeForwarding ? (
                <>⛔ REQUEST NOT FORWARDED (WALLET RECEIVED 0 REQUESTS)</>
              ) : (
                <>✓ FORWARDED TO WALLET (TX: {result.txHash?.slice(0, 14)}...)</>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tampered Forwarding / Post-Verification Mutation Inspection Box (Scenario 3) */}
      {isMutation && (
        <section className="tamper-comparison-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="section-title" style={{ margin: 0, color: '#f87171' }}>
              🔒 Level-2 Request Binding Barrier: Post-Verification Tampering Caught
            </span>
            <span className="card-status status-danger">FORWARDING ABORTED</span>
          </div>
          <p style={{ fontSize: '12px', color: '#fca5a5', marginTop: '6px' }}>
            A malicious script mutated the live transaction object in memory AFTER verification passed, but BEFORE wallet forwarding.
            ActionProof's pre-forward commitment recheck detected the cryptographic mismatch and aborted forwarding.
          </p>

          <div className="tamper-grid">
            <div className="tamper-column">
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', marginBottom: '8px' }}>
                ✓ Verified Commitment (Expected)
              </div>
              <div className="field-row">
                <span className="field-label">Commitment A:</span>
                <span className="field-value mono" style={{ fontSize: '11px', color: '#34d399' }}>
                  {result?.commitment}
                </span>
              </div>
              <div className="field-row">
                <span className="field-label">Intended Target:</span>
                <span className="field-value mono">{DEMO_ROUTER} (Uniswap Router)</span>
              </div>
              <div className="field-row">
                <span className="field-label">Policy Status:</span>
                <span className="field-value" style={{ color: '#34d399' }}>PASSED INITIAL VERIFICATION</span>
              </div>
            </div>

            <div className="tamper-column divergent">
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#f87171', marginBottom: '8px' }}>
                ✕ Pre-Forward Commitment (Actual Tampered)
              </div>
              <div className="field-row">
                <span className="field-label">Commitment B:</span>
                <span className="field-value mono" style={{ fontSize: '11px', color: '#f87171' }}>
                  {result?.forwardCommitment}
                </span>
              </div>
              <div className="field-row">
                <span className="field-label">Tampered Target:</span>
                <span className="field-value mono" style={{ color: '#f87171', fontWeight: 'bold' }}>
                  {DEMO_ATTACKER} (Attacker Address)
                </span>
              </div>
              <div className="field-row">
                <span className="field-label">Recheck Verdict:</span>
                <span className="field-value" style={{ color: '#f87171' }}>MISMATCH DETECTED — GATE ABORTED</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Unsupported Transaction Format Card (Scenario 5) */}
      {isUnsupported && (
        <section className="drawer" style={{ borderColor: '#8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="section-title" style={{ margin: 0, color: '#c4b5fd' }}>
              🛡️ MVP Scope Boundary Enforcement
            </span>
            <span className="card-status" style={{ background: '#4c1d95', color: '#e9d5ff' }}>
              FAIL-CLOSED OUTSIDE BOUNDARY
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '10px' }}>
            ActionProof maintains a strictly frozen canonical schema (<strong>actionproof.request.v1</strong>).
            Transactions utilizing features outside this boundary (such as EIP-7702 <code className="mono">authorizationList</code> or alternative RPC methods like <code className="mono">wallet_sendCalls</code>) are rejected immediately at canonicalization.
          </p>
          <div style={{ marginTop: '12px', background: '#1e1b4b', padding: '10px 14px', borderRadius: '6px', border: '1px solid #4338ca' }}>
            <div className="field-row">
              <span className="field-label">Rejection Code:</span>
              <span className="field-value mono" style={{ color: '#f87171' }}>{result?.reason}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Security Rationale:</span>
              <span className="field-value" style={{ color: '#c4b5fd' }}>
                Fails closed without forwarding. Not labeled malicious; explicitly marked unsupported.
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 6-Card Evidence Grid (shown when execution result is available) */}
      {result?.evidence && (
        <div className="evidence-grid">
          {/* Card 1: Application Claim */}
          <div className="evidence-card">
            <div className="card-header">
              <span className="card-title">1. Application Claim</span>
              <span className="provenance-tag prov-unavailable">UNTRUSTED CLIENT CLAIM</span>
            </div>
            <div className="field-row">
              <span className="field-label">Declared Action:</span>
              <span className="field-value" style={{ color: '#38bdf8', fontWeight: 'bold' }}>
                "{result.evidence.application.declaredAction}"
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Claim Source:</span>
              <span className="field-value">{result.evidence.application.source}</span>
            </div>
            <div className="disclaimer-box">
              ⚠ <strong>Zero Trust Policy:</strong> DApp display text is treated as an untrusted assertion and is never relied upon as security truth.
            </div>
          </div>

          {/* Card 2: Request Binding (Level-2 Core) */}
          <div className="evidence-card">
            <div className="card-header">
              <span className="card-title">2. Request Binding (Level-2)</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span className="provenance-tag prov-live">LEVEL-2 PROXY: ACTIVE</span>
                <span
                  className={`card-status ${
                    result.evidence.binding.status === 'MATCH'
                      ? 'status-ok'
                      : 'status-danger'
                  }`}
                >
                  {result.evidence.binding.status}
                </span>
              </div>
            </div>
            <div className="field-row">
              <span className="field-label">Verified Commitment:</span>
              <span className="field-value mono" style={{ fontSize: '11px' }}>
                {result.evidence.binding.verifiedCommitment.slice(0, 16)}...
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Pre-Forward Commitment:</span>
              <span className="field-value mono" style={{ fontSize: '11px' }}>
                {result.evidence.binding.forwardCommitment
                  ? result.evidence.binding.forwardCommitment.slice(0, 16) + '...'
                  : result.blockedBeforeForwarding
                  ? 'BLOCKED (Pre-empted)'
                  : 'MATCH'}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Provenance / Domain:</span>
              <span className="field-value mono" style={{ color: '#a78bfa' }}>
                {result.evidence.transaction.canonical.domain}
              </span>
            </div>
            <div className="disclaimer-box">
              🔒 <strong>Boundary:</strong> Binds verified request to forwarded request at provider proxy. Final signed RLP payload is <strong>OUTSIDE MVP</strong>.
            </div>
          </div>

          {/* Card 3: Decoded Call Tree & Multicall */}
          <div className="evidence-card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <span className="card-title">3. Independent Decode & Call Tree</span>
              <span
                className={`card-status ${
                  result.evidence.decode.hasExactUnlimitedApproval ||
                  result.evidence.decode.hasHighValueApproval ||
                  result.evidence.decode.status === 'UNKNOWN_CALLDATA'
                    ? 'status-danger'
                    : 'status-ok'
                }`}
              >
                {result.evidence.decode.status}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Target Contract:</span>
              <span className="field-value mono">{result.evidence.transaction.canonical.to}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Function Selector:</span>
              <span className="field-value mono">{result.evidence.decode.signature ?? '0x'}</span>
            </div>

            {renderCallTreeNodes(result.evidence.decode.callTree)}

            {result.evidence.decode.status === 'UNKNOWN_CALLDATA' && (
              <div style={{ background: '#450a0a', border: '1px solid #dc2626', padding: '8px 12px', borderRadius: '6px', color: '#fca5a5', fontSize: '12px', marginBottom: '8px' }}>
                ⛔ <strong>UNRECOGNIZED CALLDATA:</strong> ActionProof cannot independently decode the transaction semantics. Failing closed to prevent unmodeled execution.
              </div>
            )}
            {result.evidence.decode.hasExactUnlimitedApproval && (
              <div style={{ background: '#450a0a', border: '1px solid #dc2626', padding: '8px 12px', borderRadius: '6px', color: '#fca5a5', fontSize: '12px' }}>
                ⛔ <strong>CRITICAL VIOLATION:</strong> Detected stealth exact unlimited token approval (type(uint256).max) in transaction payload!
              </div>
            )}
            {result.evidence.decode.hasHighValueApproval && !result.evidence.decode.hasExactUnlimitedApproval && (
              <div style={{ background: '#78350f', border: '1px solid #f59e0b', padding: '8px 12px', borderRadius: '6px', color: '#fde68a', fontSize: '12px' }}>
                ⚠ <strong>HIGH-VALUE APPROVAL:</strong> Detected high-value token approval (amount &gt;= 10^30) in transaction payload!
              </div>
            )}
          </div>

          {/* Card 4: Contract Identity Evidence */}
          <div className="evidence-card">
            <div className="card-header">
              <span className="card-title">4. Contract Identity Evidence</span>
              <span className="provenance-tag prov-fixture">SOURCIFY: {result.evidence.contract.provenance}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Contract Name:</span>
              <span className="field-value">{result.evidence.contract.contractName ?? 'Unknown'}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Sourcify Status:</span>
              <span className="field-value mono" style={{ color: result.evidence.contract.status === 'VERIFIED_CORRESPONDENCE' ? '#34d399' : '#fbbf24' }}>
                {result.evidence.contract.status}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Source Info:</span>
              <span className="field-value" style={{ fontSize: '11px' }}>{result.evidence.contract.sourceDescription}</span>
            </div>
            <div className="disclaimer-box">
              ℹ <strong>Honest Disclaimer:</strong> {result.evidence.contract.disclaimer}
            </div>
          </div>

          {/* Card 5: Clear-Signing (ERC-7730 v2) */}
          <div className="evidence-card">
            <div className="card-header">
              <span className="card-title">5. Clear-Signing (ERC-7730 v2)</span>
              <span className="provenance-tag prov-fixture">ERC-7730: {result.evidence.intent.provenance}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Descriptor ID:</span>
              <span className="field-value mono">{result.evidence.intent.descriptorId ?? 'None'}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Cross-Validation:</span>
              <span className="field-value" style={{ color: result.evidence.intent.crossValidation.matches ? '#34d399' : '#f87171' }}>
                {result.evidence.intent.crossValidation.performed
                  ? (result.evidence.intent.crossValidation.matches ? '✓ Validated against calldata' : '✕ Discrepancy detected')
                  : 'N/A'}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Display Intent:</span>
              <span className="field-value" style={{ color: '#38bdf8' }}>
                {result.evidence.intent.intentDisplay ?? 'No formatted descriptor'}
              </span>
            </div>
            <div className="disclaimer-box">
              ℹ <strong>Advisory Evidence:</strong> {result.evidence.intent.disclaimer}
            </div>
          </div>

          {/* Card 6: Simulation Evidence (LOCAL_FIXTURE) */}
          <div className="evidence-card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <span className="card-title">6. Simulation Evidence — LOCAL_FIXTURE</span>
              <span className="provenance-tag prov-fixture">SIMULATION: {result.evidence.simulation.provenance}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#93c5fd', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '6px 10px', borderRadius: '4px', margin: '4px 0 8px 0' }}>
              ℹ <strong>Deterministic simulation fixture — not live EVM execution.</strong> Architecture is structured and ready for a live RPC backend.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="field-row">
                <span className="field-label">Simulation Status:</span>
                <span className="field-value mono" style={{ color: '#60a5fa' }}>
                  {result.evidence.simulation.status}
                </span>
              </div>
              <div className="field-row">
                <span className="field-label">Simulated Block:</span>
                <span className="field-value mono">{result.evidence.simulation.blockNumber ?? 'N/A'}</span>
              </div>
            </div>

            <div style={{ marginTop: '8px' }}>
              <span className="field-label" style={{ display: 'block', marginBottom: '4px' }}>Observed Asset Changes:</span>
              {result.evidence.simulation.assetChanges.length === 0 ? (
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>None observed</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {result.evidence.simulation.assetChanges.map((ch, idx) => (
                    <div key={idx} className="mono" style={{ fontSize: '11px', background: '#1e293b', padding: '4px 8px', borderRadius: '4px' }}>
                      [{ch.type}] {ch.asset}: {ch.amount}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="disclaimer-box" style={{ marginTop: '8px' }}>
              ℹ <strong>TOCTOU Limitation:</strong> {result.evidence.simulation.disclaimer}
            </div>
          </div>
        </div>
      )}

      {/* Policy Rules Evaluation Drawer (shown when result is available) */}
      {result?.evidence && (
        <section className="drawer">
          <div className="drawer-header">
            <span className="section-title" style={{ margin: 0 }}>
              ⚖️ Deterministic Policy Evaluation Audit Log
            </span>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>Zero LLM authority; pure deterministic rules</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {result.evidence.policy.rulesEvaluated.map((r) => (
              <div
                key={r.ruleId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: r.passed ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${r.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
              >
                <div>
                  <span className="mono" style={{ fontSize: '12px', fontWeight: 700, color: r.passed ? '#34d399' : '#f87171' }}>
                    {r.ruleId}
                  </span>
                  <span style={{ fontSize: '12px', color: '#cbd5e1', marginLeft: '12px' }}>
                    {r.description}
                  </span>
                  {r.reason && (
                    <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '2px' }}>
                      ↳ {r.reason}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: r.passed ? '#064e3b' : '#7f1d1d',
                    color: r.passed ? '#6ee7b7' : '#fca5a5',
                  }}
                >
                  {r.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Raw Payload Inspector */}
      <section className="drawer">
        <div className="drawer-header" onClick={() => setShowJson(!showJson)}>
          <span className="section-title" style={{ margin: 0 }}>
            🔍 Raw JSON Payload & Wallet Provider State
          </span>
          <span style={{ fontSize: '12px', color: '#60a5fa' }}>{showJson ? '▲ Hide' : '▼ Inspect'}</span>
        </div>
        {showJson && (
          <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>Captured Canonical Request Domain:</div>
              <pre className="json-pre">
                {result?.evidence
                  ? JSON.stringify(result.evidence.transaction.canonical, null, 2)
                  : JSON.stringify(selectedScenario.getRequest(), null, 2)}
              </pre>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                Mock Wallet Provider Received Requests (Total: {walletTxs.length}):
              </div>
              <pre className="json-pre">
                {walletTxs.length === 0
                  ? '// No requests received (blocked or unexecuted before wallet forwarding)'
                  : JSON.stringify(walletTxs, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

import React from 'react';
import type { CompleteEvidence, EvidenceProvenance } from '../../evidence/types.js';
import {
  FileCodeIcon,
  CpuIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
} from '../icons.js';

interface EvidencePanelProps {
  evidence?: CompleteEvidence;
  isReady: boolean;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  evidence,
  isReady,
}) => {
  const renderProvenanceTag = (
    prov?: string,
    fallback: 'LIVE_EXTERNAL' | 'LOCAL_FIXTURE' | 'UNAVAILABLE' = 'UNAVAILABLE'
  ) => {
    if (prov === 'LIVE_EXTERNAL') {
      return (
        <span className="prov-badge prov-live" title="Extracted from live remote Sourcify verification service">
          <span className="prov-dot dot-live"></span>
          LIVE_EXTERNAL
        </span>
      );
    }
    if (prov === 'LIVE_REGISTRY') {
      return (
        <span className="prov-badge prov-live" title="Retrieved from official ERC-7730 clear-signing registry">
          <span className="prov-dot dot-live"></span>
          LIVE_REGISTRY
        </span>
      );
    }
    if (prov === 'LIVE_BACKEND') {
      return (
        <span className="prov-badge prov-live" title="Executed via live Ethereum JSON-RPC eth_call">
          <span className="prov-dot dot-live"></span>
          LIVE_BACKEND
        </span>
      );
    }
    if (prov === 'LOCAL_FIXTURE') {
      return (
        <span className="prov-badge prov-fixture" title="Deterministic static lab fixture — not live network">
          <span className="prov-dot dot-fixture"></span>
          LOCAL_FIXTURE
        </span>
      );
    }
    return (
      <span className="prov-badge prov-unavailable" title="Evidence domain unavailable or degraded">
        <span className="prov-dot dot-unavailable"></span>
        UNAVAILABLE
      </span>
    );
  };

  return (
    <section className="soc-panel soc-evidence-panel" id="section-evidence">
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-tag tag-violet">INDEPENDENT RECONNAISSANCE</span>
          <h2 className="panel-title">Multi-Domain Evidence Pipeline</h2>
        </div>
        <div className="panel-header-right">
          <div className="evidence-truth-pill">
            <span>PROVENANCE HONESTY: FIXTURES NEVER LABELED LIVE</span>
          </div>
        </div>
      </div>

      {isReady || !evidence ? (
        <div className="evidence-empty-box">
          <CpuIcon size={24} color="#64748b" />
          <p>Evidence gathering will execute across all 4 independent modules upon gate dispatch.</p>
          <span className="text-muted text-small">
            Modules: Sourcify Correspondence &bull; ERC-7730 Clear-Signing &bull; Deterministic Simulation &bull; ABI Decompiler
          </span>
        </div>
      ) : (
        <div className="evidence-grid">
          {/* Card 1: Contract Identity (Sourcify) */}
          <div className="soc-ev-card">
            <div className="ev-card-top">
              <div className="ev-card-title text-violet">
                <FileCodeIcon size={14} color="#a78bfa" />
                <span>1. CONTRACT IDENTITY (SOURCIFY)</span>
              </div>
              {renderProvenanceTag(evidence.contract.provenance)}
            </div>

            <div className="ev-card-body">
              <div className="ev-field">
                <span className="f-label">Contract Address:</span>
                <span className="f-val mono text-small text-muted" title={evidence.contract.address}>
                  {evidence.contract.address ? `${evidence.contract.address.slice(0, 10)}...${evidence.contract.address.slice(-6)}` : 'N/A'}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Contract Name:</span>
                <span className="f-val text-cyan font-bold">
                  {evidence.contract.contractName ?? 'Unverified Contract'}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Correspondence Status:</span>
                <span
                  className={`f-val mono ${
                    evidence.contract.status === 'VERIFIED_CORRESPONDENCE'
                      ? 'text-emerald'
                      : 'text-amber'
                  }`}
                >
                  {evidence.contract.status === 'VERIFIED_CORRESPONDENCE'
                    ? 'VERIFIED_CORRESPONDENCE'
                    : evidence.contract.status === 'UNVERIFIED'
                      ? 'NO MATCH (UNVERIFIED)'
                      : 'UNAVAILABLE'}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Match Classification:</span>
                <span className="f-val mono">{evidence.contract.matchType}</span>
              </div>
              {evidence.contract.compiler && (
                <div className="ev-field">
                  <span className="f-label">Compiler Version:</span>
                  <span className="f-val mono text-small text-muted">{evidence.contract.compiler}</span>
                </div>
              )}
              {evidence.contract.abi && Array.isArray(evidence.contract.abi) && (
                <div className="ev-field">
                  <span className="f-label">Verified ABI:</span>
                  <span className="f-val text-emerald text-small mono">
                    {evidence.contract.abi.filter((item: unknown) => typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'function').length || evidence.contract.abi.length}{' '}
                    {evidence.contract.abi.some((item: unknown) => typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'function') ? 'functions loaded' : 'ABI entries loaded'}
                    {evidence.contract.provenance === 'LIVE_EXTERNAL' ? ' from live Sourcify' : ''}
                  </span>
                </div>
              )}
              <div className="ev-field">
                <span className="f-label">Source Info:</span>
                <span className="f-val text-small text-muted">
                  {evidence.contract.sourceDescription}
                </span>
              </div>
            </div>

            <div className="ev-disclaimer">
              <AlertTriangleIcon size={12} color="#94a3b8" />
              <span>{evidence.contract.disclaimer}</span>
            </div>
          </div>

          {/* Card 2: ERC-7730 Clear-Signing v2 */}
          <div className="soc-ev-card">
            <div className="ev-card-top">
              <div className="ev-card-title text-cyan">
                <ShieldCheckIcon size={14} color="#38bdf8" />
                <span>2. ERC-7730 CLEAR-SIGNING (v2.0)</span>
              </div>
              {renderProvenanceTag(evidence.intent.provenance)}
            </div>

            <div className="ev-card-body">
              <div className="ev-field">
                <span className="f-label">Descriptor Status:</span>
                <span
                  className={`f-val mono ${
                    evidence.intent.status === 'DESCRIPTOR_FOUND'
                      ? 'text-emerald'
                      : 'text-amber'
                  }`}
                >
                  {evidence.intent.status === 'DESCRIPTOR_FOUND'
                    ? 'DESCRIPTOR FOUND'
                    : evidence.intent.status === 'DESCRIPTOR_ABSENT'
                      ? 'NO MATCHING RECORD (ABSENT)'
                      : evidence.intent.status === 'DESCRIPTOR_MISMATCH'
                        ? 'DESCRIPTOR MISMATCH'
                        : 'UNAVAILABLE'}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Descriptor ID:</span>
                <span className="f-val mono text-small text-cyan" title={evidence.intent.descriptorId ?? 'None'}>
                  {evidence.intent.descriptorId ?? 'None Located'}
                </span>
              </div>
              {evidence.intent.intentDisplay && (
                <div className="ev-field">
                  <span className="f-label">Intent Display:</span>
                  <span className="f-val text-emerald text-small font-bold">
                    {evidence.intent.intentDisplay}
                  </span>
                </div>
              )}
              <div className="ev-field">
                <span className="f-label">Cross-Validation:</span>
                <span
                  className={`f-val ${
                    evidence.intent.crossValidation.matches
                      ? 'text-emerald'
                      : 'text-crimson'
                  }`}
                >
                  {evidence.intent.crossValidation.performed
                    ? evidence.intent.crossValidation.matches
                      ? '✓ Validated against calldata'
                      : '✕ Discrepancy detected'
                    : 'N/A (Descriptor Absent)'}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Schema Format:</span>
                <span className="f-val mono">ERC-7730 v{evidence.intent.schemaVersion}</span>
              </div>
            </div>

            <div className="ev-disclaimer">
              <AlertTriangleIcon size={12} color="#94a3b8" />
              <span>{evidence.intent.disclaimer}</span>
            </div>
          </div>

          {/* Card 3: EVM Simulation Evidence */}
          <div className="soc-ev-card card-span-2">
            <div className="ev-card-top">
              <div className="ev-card-title text-emerald">
                <CpuIcon size={14} color="#34d399" />
                <span>3. EVM EXECUTION SIMULATION</span>
              </div>
              {renderProvenanceTag(evidence.simulation.provenance)}
            </div>

            <div className="simulation-honest-callout">
              {evidence.simulation.provenance === 'LIVE_BACKEND' ? (
                <>
                  <span className="sim-pill sim-pill-live">LIVE EVM RPC</span>
                  <span>
                    <strong>Live EVM execution simulation via real JSON-RPC backend.</strong> Executed read-only <code className="sim-rpc-code">eth_call</code> at block #{evidence.simulation.blockNumber ?? 'latest'}.
                  </span>
                </>
              ) : evidence.simulation.provenance === 'LOCAL_FIXTURE' ? (
                <>
                  <span className="sim-pill">DETERMINISTIC FIXTURE</span>
                  <span>
                    <strong>Simulation evaluated via local test fixture model — not live EVM execution.</strong> Architecture is structured and ready for live RPC backend execution.
                  </span>
                </>
              ) : (
                <>
                  <span className="sim-pill sim-pill-degraded">DEGRADED / UNAVAILABLE</span>
                  <span>
                    <strong>Simulation evidence unavailable from live RPC backend.</strong> Fails closed or evaluated as degraded evidence under deterministic security rules.
                  </span>
                </>
              )}
            </div>

            <div className="sim-details-grid">
              <div className="ev-field">
                <span className="f-label">Simulation Status:</span>
                <span
                  className={`f-val mono ${
                    evidence.simulation.success ? 'text-emerald' : 'text-crimson'
                  }`}
                >
                  {evidence.simulation.status}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Simulated Block:</span>
                <span className="f-val mono">
                  {evidence.simulation.blockNumber ? `#${evidence.simulation.blockNumber.toLocaleString()}` : 'N/A'}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Gas Consumed:</span>
                <span className="f-val mono text-cyan">
                  {evidence.simulation.gasUsed ?? 'Standard'}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Execution Result:</span>
                <span className={evidence.simulation.success ? 'f-val text-emerald' : 'f-val text-crimson'}>
                  {evidence.simulation.success ? 'SUCCESS (NO REVERT)' : 'EVM REVERT'}
                </span>
              </div>
            </div>

            {evidence.simulation.revertReason && (
              <div className="ev-field ev-field-mt">
                <span className="f-label">Simulation Notice / Reason:</span>
                <span className="f-val mono text-small text-crimson">
                  {evidence.simulation.revertReason}
                </span>
              </div>
            )}

            <div className="asset-changes-section">
              <span className="asset-changes-title">Simulated Asset State Transitions:</span>
              {evidence.simulation.assetChanges.length === 0 ? (
                <div className="text-muted text-small">
                  {evidence.simulation.provenance === 'LIVE_BACKEND'
                    ? 'Read-only eth_call confirms execution without revert (state balance diff tracing requires debug_traceCall backend)'
                    : 'No balance shifts observed in fixture'}
                </div>
              ) : (
                <div className="asset-changes-list">
                  {evidence.simulation.assetChanges.map((ch, i) => (
                    <div key={i} className="asset-change-row mono">
                      <span className="change-type text-cyan">[{ch.type}]</span>
                      <span className="change-asset text-emerald">{ch.asset}</span>
                      <span className="change-arrow">&rarr;</span>
                      <span className="change-amount font-bold">{ch.amount}</span>
                      <span className="change-to text-muted">to {ch.to.slice(0, 10)}...</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ev-disclaimer">
              <AlertTriangleIcon size={12} color="#94a3b8" />
              <span>{evidence.simulation.disclaimer}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

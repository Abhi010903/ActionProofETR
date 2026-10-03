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
    let resolved: 'LIVE_EXTERNAL' | 'LOCAL_FIXTURE' | 'UNAVAILABLE' = fallback;
    if (prov === 'LIVE_EXTERNAL' || prov === 'LIVE_REGISTRY' || prov === 'LIVE_BACKEND') {
      resolved = 'LIVE_EXTERNAL';
    } else if (prov === 'LOCAL_FIXTURE') {
      resolved = 'LOCAL_FIXTURE';
    } else if (prov === 'NONE' || !prov) {
      resolved = 'UNAVAILABLE';
    }

    if (resolved === 'LIVE_EXTERNAL') {
      return (
        <span className="prov-badge prov-live" title="Extracted from live remote network service">
          <span className="prov-dot dot-live"></span>
          LIVE_EXTERNAL
        </span>
      );
    }
    if (resolved === 'LOCAL_FIXTURE') {
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
                  {evidence.contract.status}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Match Classification:</span>
                <span className="f-val mono">{evidence.contract.matchType}</span>
              </div>
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
                  {evidence.intent.status}
                </span>
              </div>
              <div className="ev-field">
                <span className="f-label">Descriptor ID:</span>
                <span className="f-val mono text-small text-cyan" title={evidence.intent.descriptorId ?? 'None'}>
                  {evidence.intent.descriptorId ?? 'None Located'}
                </span>
              </div>
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

          {/* Card 3: Deterministic Simulation Evidence */}
          <div className="soc-ev-card card-span-2">
            <div className="ev-card-top">
              <div className="ev-card-title text-emerald">
                <CpuIcon size={14} color="#34d399" />
                <span>3. EVM EXECUTION SIMULATION</span>
              </div>
              {renderProvenanceTag(evidence.simulation.provenance)}
            </div>

            <div className="simulation-honest-callout">
              <span className="sim-pill">DETERMINISTIC FIXTURE</span>
              <span>
                <strong>Simulation evidence evaluated via local test fixture — not live EVM execution.</strong> Architecture is structured and ready for a live RPC backend provider.
              </span>
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
                  {evidence.simulation.blockNumber ?? 'N/A'}
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
                <span className="f-val text-emerald">
                  {evidence.simulation.success ? 'SUCCESS (NO REVERT)' : 'EVM REVERT'}
                </span>
              </div>
            </div>

            <div className="asset-changes-section">
              <span className="asset-changes-title">Simulated Asset State Transitions:</span>
              {evidence.simulation.assetChanges.length === 0 ? (
                <div className="text-muted text-small">No balance shifts observed in fixture</div>
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

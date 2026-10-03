import React from 'react';
import type { ActionProofResult } from '../../provider/index.js';
import type { DemoScenario } from '../scenarios.js';
import { TerminalIcon, FileCodeIcon, AlertTriangleIcon } from '../icons.js';

interface AppRequestPanelProps {
  selectedScenario: DemoScenario;
  result: ActionProofResult | null;
  status: 'READY' | 'RUNNING' | 'COMPLETED';
}

export const AppRequestPanel: React.FC<AppRequestPanelProps> = ({
  selectedScenario,
  result,
  status,
}) => {
  const stagedReq = selectedScenario.getRequest() as Record<string, unknown>;
  const canonical = result?.evidence?.transaction.canonical;

  const fromVal = canonical?.from ?? (stagedReq.from as string) ?? 'None';
  const toVal = canonical?.to ?? (stagedReq.to as string) ?? 'None';
  const valueVal = canonical?.value ?? (stagedReq.value as string) ?? '0x0';
  const typeVal = canonical?.type ?? (stagedReq.type as string) ?? '0x2 (EIP-1559)';
  const chainIdVal = canonical?.chainId ?? (stagedReq.chainId as number) ?? 1;

  // Calldata & signature
  const rawData = (stagedReq.data as string) ?? '0x';
  const selector = rawData && rawData.length >= 10 ? rawData.slice(0, 10) : rawData;
  const decodedFunc = result?.evidence?.decode.functionName ?? null;

  // Format value to ETH if hex
  const formatEthValue = (val: string) => {
    if (!val || val === '0x' || val === '0x0') return '0 ETH';
    try {
      const bn = BigInt(val);
      if (bn === 0n) return '0 ETH';
      const eth = Number(bn) / 1e18;
      return `${eth} ETH (${val})`;
    } catch {
      return val;
    }
  };

  return (
    <section className="soc-panel soc-app-request-panel" id="section-app-request">
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-tag tag-violet">INTENT & DISPATCH DUALITY</span>
          <h2 className="panel-title">Application Intent vs EIP-1193 Captured Request</h2>
        </div>
        <div className="panel-header-right">
          <span className="provenance-tag prov-unavailable">ZERO TRUST &bull; UNTRUSTED CLAIM</span>
        </div>
      </div>

      <div className="duality-container">
        {/* Left Column: What DApp Claims (Application Intent) */}
        <div className="duality-card app-claim-card">
          <div className="card-top-bar">
            <div className="card-top-title text-cyan">
              <FileCodeIcon size={14} color="#38bdf8" />
              <span>1. APPLICATION INTENT (DAPP ASSERTION)</span>
            </div>
            <span className="source-chip">ORIGIN: DAPP UI</span>
          </div>

          <div className="claim-hero">
            <span className="claim-label">DECLARED USER ACTION:</span>
            <div className="claim-display-text text-cyan">
              &ldquo;{selectedScenario.declaredAction}&rdquo;
            </div>
          </div>

          <div className="claim-disclaimer-box">
            <div className="disclaimer-header">
              <AlertTriangleIcon size={13} color="#f59e0b" />
              <span>ZERO-TRUST SECURITY DIRECTIVE</span>
            </div>
            <p>
              Text displayed on DApp websites is client-controlled and easily forged by malicious scripts or hijacked CDN dependencies. ActionProof never treats declared text as security proof.
            </p>
          </div>

          <div className="data-field-list">
            <div className="field-item">
              <span className="f-label">RPC Invocation:</span>
              <span className="f-val mono text-cyan">{selectedScenario.method}</span>
            </div>
            <div className="field-item">
              <span className="f-label">Verification Mode:</span>
              <span className="f-val">Independent Calldata Decomposition</span>
            </div>
          </div>
        </div>

        {/* Right Column: What EIP-1193 Request Actually Captured */}
        <div className="duality-card captured-req-card">
          <div className="card-top-bar">
            <div className="card-top-title text-violet">
              <TerminalIcon size={14} color="#a78bfa" />
              <span>2. CAPTURED EIP-1193 TRANSACTION REQUEST</span>
            </div>
            <span className={`source-chip ${status === 'COMPLETED' ? 'source-verified' : 'source-staged'}`}>
              {status === 'COMPLETED' ? 'IMMUTABLE SNAPSHOT' : 'STAGED PAYLOAD'}
            </span>
          </div>

          <div className="captured-fields-grid">
            <div className="field-box">
              <span className="f-label">TARGET CONTRACT (to):</span>
              <div className="f-val-box mono text-green" title={toVal}>
                {toVal}
              </div>
            </div>

            <div className="field-box">
              <span className="f-label">ORIGIN SENDER (from):</span>
              <div className="f-val-box mono" title={fromVal}>
                {fromVal}
              </div>
            </div>

            <div className="field-box">
              <span className="f-label">NATIVE VALUE (value):</span>
              <div className="f-val-box mono text-amber">
                {formatEthValue(valueVal)}
              </div>
            </div>

            <div className="field-box">
              <span className="f-label">CHAIN ID & TYPE:</span>
              <div className="f-val-box mono">
                Chain {chainIdVal} &bull; Type {typeVal}
              </div>
            </div>
          </div>

          <div className="calldata-preview-box">
            <div className="calldata-header">
              <span className="f-label">CALLDATA / FUNCTION SELECTOR:</span>
              {decodedFunc && (
                <span className="decoded-func-tag mono">
                  Resolved: {decodedFunc}()
                </span>
              )}
            </div>
            <div className="calldata-stream mono">
              <span className="selector-highlight">{selector}</span>
              <span className="calldata-rest">
                {rawData.length > 10 ? rawData.slice(10, 66) + '...' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

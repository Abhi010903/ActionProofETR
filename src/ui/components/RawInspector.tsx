import React, { useState } from 'react';
import type { ActionProofResult } from '../../provider/index.js';
import type { DemoScenario } from '../scenarios.js';
import { TerminalIcon } from '../icons.js';

interface RawInspectorProps {
  selectedScenario: DemoScenario;
  result: ActionProofResult | null;
  walletTxs: Record<string, unknown>[];
}

export const RawInspector: React.FC<RawInspectorProps> = ({
  selectedScenario,
  result,
  walletTxs,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="soc-panel soc-raw-panel" id="section-raw">
      <button
        className="raw-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="toggle-left">
          <TerminalIcon size={14} color="#38bdf8" />
          <span className="toggle-title">RAW TELEMETRY & WALLET DISPATCH LOGS</span>
        </div>
        <div className="toggle-right">
          <span className="wallet-count-pill mono">
            WALLET RECEIVED: {walletTxs.length}
          </span>
          <span className="toggle-arrow">{isOpen ? '▲ HIDE' : '▼ INSPECT'}</span>
        </div>
      </button>

      {isOpen && (
        <div className="raw-content-grid">
          <div className="raw-col">
            <div className="raw-col-header">
              <span>CANONICAL REQUEST DOMAIN (actionproof.request.v1)</span>
            </div>
            <pre className="raw-pre mono">
              {result?.evidence
                ? JSON.stringify(result.evidence.transaction.canonical, null, 2)
                : JSON.stringify(selectedScenario.getRequest(), null, 2)}
            </pre>
          </div>

          <div className="raw-col">
            <div className="raw-col-header">
              <span>MOCK WALLET DISPATCH HISTORY (TOTAL: {walletTxs.length})</span>
            </div>
            <pre className="raw-pre mono">
              {walletTxs.length === 0
                ? '// ZERO REQUESTS RECEIVED\n// Forwarding barrier successfully halted execution before dispatch'
                : JSON.stringify(walletTxs, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
};

import React from 'react';
import { EthIcon, ShieldLockIcon, RefreshIcon, ActivityIcon } from '../icons.js';

interface TopBarProps {
  executionCount: number;
  verifiedCount: number;
  blockedCount: number;
  onReset: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  executionCount,
  verifiedCount,
  blockedCount,
  onReset,
}) => {
  return (
    <header className="soc-topbar">
      <div className="soc-brand-section">
        <div className="soc-logo-badge">
          <div className="soc-eth-glow">
            <EthIcon size={24} color="#60a5fa" />
          </div>
          <div className="soc-brand-text">
            <div className="soc-title-row">
              <span className="soc-title">ACTIONPROOF</span>
              <span className="soc-chip">ETH-SOC // v1.0</span>
              <span className="soc-live-beacon">
                <span className="beacon-dot"></span>
                CONTROLLED PROXY
              </span>
            </div>
            <div className="soc-subtitle">
              PRE-SIGNING TRANSACTION SECURITY &bull; CONTROLLED EIP-1193 RECHECK GATE
            </div>
          </div>
        </div>
      </div>

      <div className="soc-metrics-section">
        {/* Configured Network Identity & Provider Status */}
        <div className="soc-status-group">
          <div className="soc-metric-card" title="Configured / represented network identity (Controlled mock-wallet environment)">
            <span className="metric-label">ETHEREUM</span>
            <div className="metric-val text-cyan">
              <EthIcon size={12} color="#38bdf8" />
              CHAIN ID: 1
            </div>
          </div>

          <div className="soc-metric-card" title="Controlled EIP-1193 provider boundary integration">
            <span className="metric-label">PROVIDER GATE</span>
            <div className="metric-val text-violet">
              <ShieldLockIcon size={14} color="#a78bfa" />
              CONTROLLED PROXY
            </div>
          </div>

          <div className="soc-metric-card" title="System Security State">
            <span className="metric-label">SYSTEM STATE</span>
            <div className="metric-val text-emerald">
              <ActivityIcon size={14} color="#34d399" />
              ARMED // STRICT
            </div>
          </div>
        </div>

        {/* Telemetry Counters */}
        <div className="soc-counters-group">
          <div className="counter-pill counter-verified" title="Verified transactions dispatched to wallet">
            <span className="counter-num">{verifiedCount}</span>
            <span className="counter-label">VERIFIED</span>
          </div>

          <div className="counter-pill counter-blocked" title="Threats blocked before wallet forwarding">
            <span className="counter-num">{blockedCount}</span>
            <span className="counter-label">BLOCKED</span>
          </div>

          <div className="counter-pill counter-total" title="Total requests evaluated">
            <span className="counter-num">{executionCount}</span>
            <span className="counter-label">RUNS</span>
          </div>

          <button
            className="soc-btn-reset"
            onClick={onReset}
            title="Reset wallet state and execution history to READY"
          >
            <RefreshIcon size={13} color="#cbd5e1" />
            <span>RESET LAB</span>
          </button>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import {
  EthIcon,
  ShieldCheckIcon,
  RadarIcon,
  FileCodeIcon,
  RefreshIcon,
  SunIcon,
  MoonIcon,
  ShieldLockIcon,
  ActionProofMarkIcon,
} from '../icons.js';

export interface SidebarProps {
  currentView: 'dashboard' | 'details' | 'result';
  onNavigate: (view: 'dashboard' | 'details' | 'result') => void;
  selectedScenarioId?: string;
  hasResult: boolean;
  executionCount: number;
  verifiedCount: number;
  blockedCount: number;
  onReset: () => void;
  theme: 'day' | 'night';
  onToggleTheme: () => void;
  mode: 'DEMO' | 'LIVE';
  onToggleMode: (mode: 'DEMO' | 'LIVE') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  hasResult,
  executionCount,
  verifiedCount,
  blockedCount,
  onReset,
  theme,
  onToggleTheme,
  mode,
  onToggleMode,
}) => {
  return (
    <aside className="ap-sidebar ap-sidebar-branded" aria-label="ActionProof Sidebar">
      {/* Brand & Logo Header */}
      <div className="ap-sidebar-header">
        <div className="ap-brand-row">
          <div className="ap-brand-icon-box ap-brand-mark">
            <ActionProofMarkIcon size={28} />
          </div>
          <div className="ap-brand-info">
            <div className="ap-brand-name">ActionProof</div>
            <div className="ap-brand-subtitle">Pre-signing security</div>
          </div>
        </div>

        <div className="ap-brand-meta">
          <span className="ap-chip-ethereum">
            <EthIcon size={12} color="var(--cyan-light)" />
            <span>Ethereum</span>
          </span>
          <span className="ap-chip-net mono">Chain ID: 1</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="ap-sidebar-nav">
        <div className="ap-nav-section-title">Navigation</div>

        <button
          type="button"
          className={`ap-nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
          title="Return to Test Matrix Dashboard"
        >
          <span className="ap-nav-icon">
            <RadarIcon size={16} />
          </span>
          <span className="ap-nav-text">Test Matrix</span>
          <span className="ap-nav-badge mono">5 TESTS</span>
        </button>

        <button
          type="button"
          className={`ap-nav-item ${currentView === 'details' ? 'active' : ''}`}
          onClick={() => onNavigate('details')}
          title="Inspect Selected Test Parameters"
        >
          <span className="ap-nav-icon">
            <FileCodeIcon size={16} />
          </span>
          <span className="ap-nav-text">Test Details</span>
          <span className="ap-nav-indicator">
            {currentView === 'details' ? 'ACTIVE' : 'READY'}
          </span>
        </button>

        <button
          type="button"
          className={`ap-nav-item ${currentView === 'result' ? 'active' : ''} ${!hasResult ? 'disabled' : ''}`}
          onClick={() => hasResult && onNavigate('result')}
          disabled={!hasResult}
          title={hasResult ? 'View Security Verdict & Evidence Tabs' : 'Execute a test to view results'}
        >
          <span className="ap-nav-icon">
            <ShieldCheckIcon size={16} />
          </span>
          <span className="ap-nav-text">Security Verdict</span>
          <span className="ap-nav-indicator">
            {hasResult ? 'READY' : 'STANDBY'}
          </span>
        </button>
      </nav>

      {/* Mode & Telemetry Section */}
      <div className="ap-sidebar-telemetry">
        <div className="ap-nav-section-title">Lab controls</div>

        {/* Mode Switcher */}
        <div className="ap-mode-toggle-card">
          <span className="ap-telemetry-label">EXECUTION MODE</span>
          <div className="ap-mode-toggle-pill">
            <button
              type="button"
              className={`ap-mode-btn ${mode === 'DEMO' ? 'active-demo' : ''}`}
              onClick={() => onToggleMode('DEMO')}
              title="Deterministic Fixtures Mode"
            >
              DEMO
            </button>
            <button
              type="button"
              className={`ap-mode-btn ${mode === 'LIVE' ? 'active-live' : ''}`}
              onClick={() => onToggleMode('LIVE')}
              title="Live External RPC & Sourcify Mode"
            >
              LIVE
            </button>
          </div>
        </div>

        {/* Session Counters */}
        <div className="ap-counters-grid">
          <div className="ap-counter-box counter-verified" title="Verified transactions dispatched to wallet">
            <span className="ap-counter-num mono">{verifiedCount}</span>
            <span className="ap-counter-lbl">VERIFIED</span>
          </div>
          <div className="ap-counter-box counter-blocked" title="Threats blocked before wallet forwarding">
            <span className="ap-counter-num mono">{blockedCount}</span>
            <span className="ap-counter-lbl">BLOCKED</span>
          </div>
          <div className="ap-counter-box counter-runs" title="Total evaluations in this session">
            <span className="ap-counter-num mono">{executionCount}</span>
            <span className="ap-counter-lbl">RUNS</span>
          </div>
        </div>

        {/* Boundary & System State */}
        <div className="ap-system-status-box">
          <div className="ap-status-row">
            <span className="ap-status-dot green"></span>
            <span className="ap-status-text">Gate: Armed (Strict)</span>
          </div>
          <div className="ap-status-row">
            <ShieldLockIcon size={12} color="var(--text-muted)" />
            <span className="ap-status-text">Level-2 Provider Gate</span>
          </div>
        </div>

        {/* Reset Demo Button */}
        <button
          type="button"
          className="ap-btn-reset-lab"
          onClick={onReset}
          title="Reset session state, counters, and demo runner"
        >
          <RefreshIcon size={13} />
          <span>Reset Demo Lab</span>
        </button>
      </div>

      {/* Footer & Theme Toggle */}
      <div className="ap-sidebar-footer">
        <button
          type="button"
          className="ap-theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === 'day' ? 'Switch to Night mode' : 'Switch to Day mode'}
          aria-label="Toggle between Day and Night mode"
        >
          <span className="ap-theme-icon">
            {theme === 'day' ? <MoonIcon size={15} /> : <SunIcon size={15} />}
          </span>
          <span className="ap-theme-label">
            {theme === 'day' ? 'Night Mode' : 'Day Mode'}
          </span>
        </button>
      </div>
    </aside>
  );
};

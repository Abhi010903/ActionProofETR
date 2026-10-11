import React, { useState, useMemo, useSyncExternalStore, useEffect, useCallback } from 'react';
import { DemoRunner } from './runner.js';
import { DEMO_SCENARIOS, type DemoScenario } from './scenarios.js';
import { Sidebar } from './components/Sidebar.js';
import { PipelineHero } from './components/PipelineHero.js';
import { AppRequestPanel } from './components/AppRequestPanel.js';
import { Level2Binding } from './components/Level2Binding.js';
import { CallTreePanel } from './components/CallTreePanel.js';
import { EvidencePanel } from './components/EvidencePanel.js';
import { PolicyPanel } from './components/PolicyPanel.js';
import { RawInspector } from './components/RawInspector.js';
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  ShieldLockIcon,
  AlertTriangleIcon,
  EthIcon,
  PlayIcon,
  RefreshIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  FileCodeIcon,
  CpuIcon,
  ScaleIcon,
  GitBranchIcon,
  TerminalIcon,
  ActivityIcon,
} from './icons.js';

type AppView = 'dashboard' | 'details' | 'result';
type ResultTab = 'overview' | 'calls' | 'evidence' | 'simulation' | 'policy';

// Explicit 5 primary test cards configuration requested for the primary dashboard
const PRIMARY_SCENARIO_CONFIGS = [
  {
    id: 'normal_swap',
    displayTitle: 'Normal Supported Swap',
    displayDesc: 'Legitimate Swap 100 USDC -> ETH via SwapRouter02',
  },
  {
    id: 'attack_multicall_stealth_approval',
    displayTitle: 'Swap + Malicious Approval',
    displayDesc: 'DApp UI claims swap, but batch contains stealth unlimited approval',
  },
  {
    id: 'unknown_calldata',
    displayTitle: 'Unknown / Unverified Contract',
    displayDesc: 'Unrecognized selector 0x12345678 cannot be independently decoded',
  },
  {
    id: 'attack_value_mutation',
    displayTitle: 'Value Transfer',
    displayDesc: 'Native transaction value injected post-verification (0 ETH -> 10 ETH)',
  },
  {
    id: 'attack_calldata_mutation',
    displayTitle: 'Custom Calldata',
    displayDesc: 'Calldata payload swapped to drainer contract post-verification',
  },
] as const;

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
    mode,
  } = state;

  // Day mode is the default for first-time visitors
  const [theme, setTheme] = useState<'day' | 'night'>(() => {
    try {
      const saved = localStorage.getItem('actionproof_theme');
      return saved === 'night' ? 'night' : 'day';
    } catch {
      return 'day';
    }
  });

  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [activeTab, setActiveTab] = useState<ResultTab>('overview');
  const [showRawData, setShowRawData] = useState(false);
  const [showExtendedLabs, setShowExtendedLabs] = useState(false);

  // Track session verified vs blocked counters
  const [sessionCounters, setSessionCounters] = useState({
    verified: 0,
    blocked: 0,
  });

  // Apply theme to document element and persist in localStorage
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('actionproof_theme', theme);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [theme]);

  // Synchronize routing state with window.location.hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (!hash || hash === '#dashboard' || hash === '#') {
        setCurrentView('dashboard');
      } else if (hash.startsWith('#test=')) {
        const id = hash.replace('#test=', '');
        const found = DEMO_SCENARIOS.find((s) => s.id === id);
        if (found) {
          if (selectedScenario.id !== found.id) {
            runner.selectScenario(found);
          }
          setCurrentView('details');
        }
      } else if (hash.startsWith('#result=')) {
        const id = hash.replace('#result=', '');
        const found = DEMO_SCENARIOS.find((s) => s.id === id);
        if (found) {
          if (selectedScenario.id !== found.id) {
            runner.selectScenario(found);
          }
          if (result) {
            setCurrentView('result');
          } else {
            setCurrentView('details');
          }
        }
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [runner, selectedScenario.id, result]);

  // Update session counters when execution finishes
  useEffect(() => {
    if (status === 'COMPLETED' && result) {
      if (result.verdict === 'VERIFIED' || result.verdict === 'DEMO_VERIFIED') {
        setSessionCounters((prev) => ({ ...prev, verified: prev.verified + 1 }));
      } else {
        setSessionCounters((prev) => ({ ...prev, blocked: prev.blocked + 1 }));
      }
      // When execution finishes, transition to result view
      setCurrentView('result');
      window.location.hash = `#result=${selectedScenario.id}`;
    }
  }, [status, result, executionCount, selectedScenario.id]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'day' ? 'night' : 'day'));
  }, []);

  const handleReset = useCallback(() => {
    runner.resetDemo();
    setSessionCounters({ verified: 0, blocked: 0 });
    setCurrentView('dashboard');
    window.location.hash = '#dashboard';
  }, [runner]);

  const handleSelectScenario = useCallback(
    (scenario: DemoScenario) => {
      runner.selectScenario(scenario);
      setCurrentView('details');
      window.location.hash = `#test=${scenario.id}`;
    },
    [runner]
  );

  const handleBackToDashboard = useCallback(() => {
    setCurrentView('dashboard');
    window.location.hash = '#dashboard';
  }, []);

  const handleExecute = useCallback(async () => {
    try {
      await runner.execute();
    } catch {
      // Runner records errors in state.result safely
    }
  }, [runner]);

  const isRunning = status === 'RUNNING';

  // Find scenarios for the primary 5 cards
  const primaryCards = useMemo(() => {
    return PRIMARY_SCENARIO_CONFIGS.map((cfg) => {
      const scenario = DEMO_SCENARIOS.find((s) => s.id === cfg.id)!;
      return {
        ...cfg,
        scenario,
      };
    });
  }, []);

  // Remaining scenarios for the extended threat labs section
  const extendedScenarios = useMemo(() => {
    const primaryIds = new Set(PRIMARY_SCENARIO_CONFIGS.map((c) => c.id));
    return DEMO_SCENARIOS.filter((s) => !primaryIds.has(s.id as any));
  }, []);

  const getCategoryDisplayLabel = (category: DemoScenario['category']) => {
    switch (category) {
      case 'NORMAL':
        return 'RECOMMENDED';
      case 'ATTACK':
        return 'ATTACK';
      case 'UNVERIFIABLE':
        return 'UNVERIFIABLE';
      case 'MUTATION':
        return 'MUTATION';
      case 'UNSUPPORTED':
        return 'UNSUPPORTED';
      case 'BOUNDARY':
        return 'BOUNDARY';
      default:
        return category;
    }
  };

  const getCardToneClass = (category: DemoScenario['category']) => {
    switch (category) {
      case 'NORMAL':
        return 'dash-card-tone-normal';
      case 'ATTACK':
        return 'dash-card-tone-attack';
      case 'UNVERIFIABLE':
        return 'dash-card-tone-unverifiable';
      case 'MUTATION':
        return 'dash-card-tone-mutation';
      case 'UNSUPPORTED':
        return 'dash-card-tone-unsupported';
      default:
        return 'dash-card-tone-default';
    }
  };

  const getScenarioOutcomeHint = (scenario: DemoScenario) => {
    switch (scenario.category) {
      case 'NORMAL':
        return 'Demonstrates the supported verification path. In DEMO mode, fixture checks can yield DEMO_VERIFIED (not live network verification).';
      case 'ATTACK':
      case 'MUTATION':
        return 'Configured to surface blocking or Level-2 commitment mismatch before the wallet receives a forwarded request.';
      case 'UNVERIFIABLE':
        return 'Fail-closed when calldata or contract identity cannot be independently verified under current policy.';
      case 'UNSUPPORTED':
        return 'Surfaces UNSUPPORTED when the staged request type is outside the supported verification boundary.';
      case 'BOUNDARY':
        return 'Illustrates boundary or bypass semantics defined for this lab scenario.';
      default:
        return scenario.shortDescription;
    }
  };

  const primaryScenarioIndex = PRIMARY_SCENARIO_CONFIGS.findIndex(
    (c) => c.id === selectedScenario.id
  );

  const getCategoryBadgeClass = (category: DemoScenario['category']) => {
    switch (category) {
      case 'NORMAL':
        return 'badge-cat-normal';
      case 'ATTACK':
        return 'badge-cat-attack';
      case 'MUTATION':
        return 'badge-cat-mutation';
      case 'UNVERIFIABLE':
        return 'badge-cat-unverifiable';
      case 'UNSUPPORTED':
        return 'badge-cat-unsupported';
      default:
        return 'badge-cat-default';
    }
  };

  const getScenarioIcon = (category: DemoScenario['category'], size = 18) => {
    switch (category) {
      case 'NORMAL':
        return <ShieldCheckIcon size={size} color="var(--green-emerald)" />;
      case 'ATTACK':
        return <ShieldAlertIcon size={size} color="var(--red-crimson)" />;
      case 'MUTATION':
        return <ShieldLockIcon size={size} color="var(--red-crimson)" />;
      case 'UNVERIFIABLE':
        return <AlertTriangleIcon size={size} color="var(--amber-warn)" />;
      case 'UNSUPPORTED':
        return <AlertTriangleIcon size={size} color="var(--eth-violet)" />;
      default:
        return <ShieldLockIcon size={size} color="var(--text-muted)" />;
    }
  };

  const getExpectedOutcomeBadge = (scenario: DemoScenario) => {
    switch (scenario.category) {
      case 'NORMAL':
        return {
          label: 'DEMO_VERIFIED',
          hint: 'Typical in DEMO when fixture checks pass — not live network verification.',
          tone: 'verified' as const,
        };
      case 'UNSUPPORTED':
        return {
          label: 'UNSUPPORTED',
          hint: 'Staged request type is outside the supported verification boundary.',
          tone: 'unsupported' as const,
        };
      case 'UNVERIFIABLE':
      case 'ATTACK':
      case 'MUTATION':
        return {
          label: 'BLOCKED',
          hint: 'Lab scenario is configured to block or fail-closed before wallet forwarding.',
          tone: 'blocked' as const,
        };
      default:
        return {
          label: 'LAB',
          hint: scenario.shortDescription,
          tone: 'neutral' as const,
        };
    }
  };

  const getVerdictBannerIcon = (verdict: string) => {
    const v = verdict.toLowerCase();
    if (v === 'verified' || v === 'demo_verified') {
      return <ShieldCheckIcon size={40} color="#ffffff" />;
    }
    if (v === 'blocked') {
      return <ShieldAlertIcon size={40} color="#ffffff" />;
    }
    return <AlertTriangleIcon size={40} color="#ffffff" />;
  };

  const formatEthValue = (val: unknown) => {
    if (!val || val === '0x' || val === '0x0') return '0 ETH';
    try {
      const bn = BigInt(String(val));
      if (bn === 0n) return '0 ETH';
      const eth = Number(bn) / 1e18;
      return `${eth} ETH`;
    } catch {
      return String(val);
    }
  };

  const stagedReq = selectedScenario.getRequest() as Record<string, unknown>;
  const stagedData = String(stagedReq.data ?? '0x');
  const stagedSelector = stagedData.length >= 10 ? stagedData.slice(0, 10) : stagedData;

  const getVerdictBadgeLabel = (verdict: string) => {
    switch (verdict) {
      case 'VERIFIED':
        return '✓ VERIFIED';
      case 'DEMO_VERIFIED':
        return '✓ DEMO_VERIFIED';
      case 'BLOCKED':
        return '⛔ BLOCKED';
      case 'UNSUPPORTED':
        return '⚡ UNSUPPORTED';
      case 'WARNING':
        return '⚠ WARNING';
      default:
        return verdict;
    }
  };

  return (
    <div className="soc-app-wrapper" data-theme={theme}>
      {/* Background Matrix & Subtle Grid */}
      <div className="soc-bg-grid"></div>

      {/* Solid Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={(view) => {
          setCurrentView(view);
          if (view === 'dashboard') window.location.hash = '#dashboard';
          if (view === 'details') window.location.hash = `#test=${selectedScenario.id}`;
          if (view === 'result' && result) window.location.hash = `#result=${selectedScenario.id}`;
        }}
        selectedScenarioId={selectedScenario.id}
        hasResult={result !== null}
        executionCount={executionCount}
        verifiedCount={sessionCounters.verified}
        blockedCount={sessionCounters.blocked}
        onReset={handleReset}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        mode={mode}
        onToggleMode={(m) => runner.setMode(m)}
      />

      {/* Main Operations Canvas */}
      <main className="soc-main-content">
        {/* ============================================================== */}
        {/* STEP 1: MAIN DASHBOARD (LANDING)                                */}
        {/* ============================================================== */}
        {currentView === 'dashboard' && (
          <div className="dash-view-container">
            <div className="dash-top-bar">
              <div className="dash-network-pill" title="Configured lab network identity">
                <EthIcon size={16} color="var(--green-emerald)" />
                <span className="dash-network-name">Ethereum Mainnet</span>
                <span className="dash-network-dot" aria-hidden />
                <span className="dash-network-status">Connected</span>
              </div>
            </div>

            <header className="dash-hero-header">
              <div className="dash-hero-split">
                <div className="dash-hero-copy">
                  <div className="dash-hero-badge">Pre-signing transaction security</div>
                  <h1 className="dash-hero-title">Test Ethereum Transactions</h1>
                  <p className="dash-hero-subtitle">
                    Pick a scenario card to open test details, review staged request fields, then run
                    Intercept and Verify.
                  </p>
                </div>
                <div className="dash-hero-visual" aria-hidden>
                  <div className="eth-visual-stack">
                    <div className="eth-block eth-block-a">
                      <EthIcon size={22} color="#627EEA" />
                    </div>
                    <div className="eth-block eth-block-b">
                      <EthIcon size={18} color="#8B5CF6" />
                    </div>
                    <div className="eth-block eth-block-c">
                      <EthIcon size={14} color="#2563EB" />
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <div className="dash-cards-grid dash-cards-grid-primary">
              {primaryCards.map((card, index) => {
                const sc = card.scenario;
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`dash-test-card dash-test-card-v2 ${getCardToneClass(sc.category)}`}
                    onClick={() => handleSelectScenario(sc)}
                  >
                    <div className="card-top-row">
                      <span className="card-test-index mono">{String(index + 1).padStart(2, '0')}</span>
                      <span className={`card-category-badge ${getCategoryBadgeClass(sc.category)}`}>
                        {getCategoryDisplayLabel(sc.category)}
                      </span>
                    </div>

                    <div className="card-body card-body-centered">
                      <div className="card-icon-box-lg">{getScenarioIcon(sc.category, 26)}</div>
                      <h2 className="card-title">{card.displayTitle}</h2>
                      <p className="card-desc">{card.displayDesc}</p>
                    </div>

                    <div className="card-footer">
                      <span className="card-method mono">{sc.method}</span>
                      <span className="card-cta-circle" aria-hidden>
                        <ArrowRightIcon size={14} color="#ffffff" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="dash-footer-note">
              Each test uses real staged request data and the existing verification pipeline — select a card
              to inspect before running.
            </p>

            {/* Extended Threat Labs Section (Remaining Scenarios) */}
            <div className="dash-extended-section">
              <button
                type="button"
                className="btn-toggle-extended"
                onClick={() => setShowExtendedLabs(!showExtendedLabs)}
              >
                <span>{showExtendedLabs ? '▲ HIDE' : '▼ VIEW'} EXTENDED THREAT LABS (SCENARIOS 6–9)</span>
                <span className="extended-pill mono">CALIBRATION & BOUNDARY</span>
              </button>

              {showExtendedLabs && (
                <div className="dash-cards-grid extended-grid">
                  {extendedScenarios.map((sc, index) => (
                    <button
                      key={sc.id}
                      type="button"
                      className={`dash-test-card dash-test-card-v2 ${getCardToneClass(sc.category)}`}
                      onClick={() => handleSelectScenario(sc)}
                    >
                      <div className="card-top-row">
                        <span className="card-test-index mono">{String(index + 6).padStart(2, '0')}</span>
                        <span className={`card-category-badge ${getCategoryBadgeClass(sc.category)}`}>
                          {getCategoryDisplayLabel(sc.category)}
                        </span>
                      </div>

                      <div className="card-body card-body-centered">
                        <div className="card-icon-box-lg">{getScenarioIcon(sc.category, 26)}</div>
                        <h2 className="card-title">{sc.name.replace(/^\d+\.\s*/, '')}</h2>
                        <p className="card-desc">{sc.shortDescription}</p>
                      </div>

                      <div className="card-footer">
                        <span className="card-method mono">{sc.method}</span>
                        <span className="card-cta-circle" aria-hidden>
                          <ArrowRightIcon size={14} color="#ffffff" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 2 & 3: SELECTED TEST DETAILS & INTERCEPTION                */}
        {/* ============================================================== */}
        {currentView === 'details' && (
          <div className="details-view-container">
            <div className="details-nav-bar">
              <button
                type="button"
                className="btn-back-nav"
                onClick={handleBackToDashboard}
              >
                <ArrowLeftIcon size={14} />
                <span>Back to Test Cases</span>
              </button>

              {primaryScenarioIndex >= 0 && (
                <div className="details-nav-pagination mono">
                  {String(primaryScenarioIndex + 1).padStart(2, '0')} /{' '}
                  {String(PRIMARY_SCENARIO_CONFIGS.length).padStart(2, '0')}
                </div>
              )}
            </div>

            <div className="details-card">
              <div className="details-card-header">
                <div className="details-badge-row">
                  <span className={`card-category-badge ${getCategoryBadgeClass(selectedScenario.category)}`}>
                    {getCategoryDisplayLabel(selectedScenario.category)}
                  </span>
                  <span className="details-method-tag mono">{selectedScenario.method}</span>
                </div>
                <h1 className="details-title">
                  {PRIMARY_SCENARIO_CONFIGS.find((c) => c.id === selectedScenario.id)?.displayTitle ??
                    selectedScenario.name.replace(/^\d+\.\s*/, '')}
                </h1>
                <p className="details-desc">{selectedScenario.shortDescription}</p>
              </div>

              <div className="details-layout-grid">
                <section
                  className="details-panel details-panel-params details-panel-table"
                  aria-labelledby="details-params-heading"
                >
                  <h2 id="details-params-heading" className="details-panel-title">
                    Test details
                  </h2>
                  <dl className="details-field-list">
                    <div className="details-field-row">
                      <dt>Network</dt>
                      <dd>Ethereum Mainnet (Chain ID 1)</dd>
                    </div>
                    <div className="details-field-row">
                      <dt>Declared action</dt>
                      <dd className="text-bold">&ldquo;{selectedScenario.declaredAction}&rdquo;</dd>
                    </div>
                    <div className="details-field-row">
                      <dt>From</dt>
                      <dd className="mono" title={String(stagedReq.from ?? '')}>
                        {String(stagedReq.from ?? 'N/A')}
                      </dd>
                    </div>
                    <div className="details-field-row">
                      <dt>To</dt>
                      <dd className="mono text-cyan" title={String(stagedReq.to ?? '')}>
                        {String(stagedReq.to ?? 'N/A')}
                      </dd>
                    </div>
                    <div className="details-field-row">
                      <dt>Value</dt>
                      <dd className="mono">{formatEthValue(stagedReq.value)}</dd>
                    </div>
                    <div className="details-field-row">
                      <dt>Calldata selector</dt>
                      <dd className="mono selector-tag inline">{stagedSelector}</dd>
                    </div>
                    <div className="details-field-row details-field-row-stack">
                      <dt>Calldata preview</dt>
                      <dd className="mono calldata-preview-block">
                        {stagedData.length > 120 ? `${stagedData.slice(0, 120)}…` : stagedData}
                      </dd>
                    </div>
                    <div className="details-field-row">
                      <dt>Scenario ID</dt>
                      <dd className="mono text-muted">{selectedScenario.id}</dd>
                    </div>
                  </dl>
                </section>

                <div className="details-side-column">
                  <section className="details-panel details-panel-about" aria-labelledby="details-about-heading">
                    <h2 id="details-about-heading" className="details-panel-title">
                      What this test does
                    </h2>
                    <p className="details-about-lead">{selectedScenario.shortDescription}</p>
                    <p className="details-about-text">{selectedScenario.explanation}</p>
                  </section>

                  {(() => {
                    const expected = getExpectedOutcomeBadge(selectedScenario);
                    return (
                      <section
                        className={`details-panel details-panel-expected details-expected-${expected.tone}`}
                        aria-labelledby="details-outcome-heading"
                      >
                        <h2 id="details-outcome-heading" className="details-panel-title">
                          Expected lab outcome
                        </h2>
                        <div className="details-expected-visual">
                          <div className="details-expected-icon">
                            {expected.tone === 'verified' && (
                              <ShieldCheckIcon size={32} color="var(--green-emerald)" />
                            )}
                            {expected.tone === 'blocked' && (
                              <ShieldAlertIcon size={32} color="var(--red-crimson)" />
                            )}
                            {expected.tone === 'unsupported' && (
                              <AlertTriangleIcon size={32} color="var(--eth-violet)" />
                            )}
                            {expected.tone === 'neutral' && (
                              <ShieldLockIcon size={32} color="var(--text-muted)" />
                            )}
                          </div>
                          <span
                            className={`details-expected-badge details-expected-badge-${expected.tone}`}
                          >
                            {expected.label}
                          </span>
                        </div>
                        <p className="details-outcome-text">{expected.hint}</p>
                        <p className="details-outcome-sub">{getScenarioOutcomeHint(selectedScenario)}</p>
                      </section>
                    );
                  })()}
                </div>
              </div>

              {executionCount > 0 && lastExecutionTimestamp && (
                <div className="execution-status-meta details-exec-meta">
                  <span className="meta-badge mono">EXECUTION #{executionCount}</span>
                  <span className="meta-time mono">{lastExecutionTimestamp}</span>
                </div>
              )}

              <div className="details-action-footer details-action-footer-stack">
                <button
                  type="button"
                  className={`btn-intercept-dispatch btn-intercept-full ${isRunning ? 'running' : ''}`}
                  disabled={isRunning}
                  onClick={handleExecute}
                >
                  {isRunning ? (
                    <>
                      <span className="spinner"></span>
                      <span>Processing via Proxy...</span>
                    </>
                  ) : executionCount === 0 ? (
                    <>
                      <PlayIcon size={16} />
                      <span>Intercept and Verify</span>
                    </>
                  ) : (
                    <>
                      <RefreshIcon size={16} />
                      <span>Re-Execute Gate</span>
                    </>
                  )}
                </button>
              </div>

              {isRunning && (
                <div className="interception-progress-notice">
                  <div className="progress-dot pulse-anim"></div>
                  <span>Evaluating transaction request at the controlled EIP-1193 boundary...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 4: RESULT DASHBOARD WITH ORGANIZED TABS                    */}
        {/* ============================================================== */}
        {currentView === 'result' && result && (
          <div className="result-view-container">
            {/* Navigation and Re-Execute Header */}
            <div className="result-nav-bar">
              <button
                type="button"
                className="btn-back-nav"
                onClick={handleBackToDashboard}
              >
                <ArrowLeftIcon size={14} />
                <span>Back to Tests</span>
              </button>

              <div className="result-nav-actions">
                {lastExecutionTimestamp && (
                  <div className="execution-meta-pill mono">
                    RUN #{executionCount} &bull; {lastExecutionTimestamp}
                  </div>
                )}

                <button
                  type="button"
                  className="btn-reexecute-nav"
                  disabled={isRunning}
                  onClick={handleExecute}
                >
                  <RefreshIcon size={13} />
                  <span>Re-Execute Gate</span>
                </button>
              </div>
            </div>

            <div
              className={`result-verdict-banner verdict-banner-${result.verdict.toLowerCase().replace(/_/g, '-')}`}
            >
              <div className="verdict-banner-icon-wrap">{getVerdictBannerIcon(result.verdict)}</div>
              <div className="verdict-banner-content">
                <div className="verdict-banner-top">
                  <span className="verdict-label-tag">Analysis Complete</span>
                  <span
                    className={`verdict-solid-badge verdict-solid-${result.verdict.toLowerCase().replace(/_/g, '-')}`}
                  >
                    {getVerdictBadgeLabel(result.verdict)}
                  </span>
                </div>
                <h1 className="verdict-main-headline">
                  {result.verdict === 'VERIFIED'
                    ? 'Transaction verified (live checks)'
                    : result.verdict === 'DEMO_VERIFIED'
                    ? 'Demo fixture verification complete'
                    : result.verdict === 'BLOCKED'
                    ? 'Request blocked before wallet forwarding'
                    : result.verdict === 'UNSUPPORTED'
                    ? 'Unsupported transaction type'
                    : 'Policy warning issued'}
                </h1>
                <p className="verdict-short-explanation">
                  {result.reason ??
                    result.evidence?.policy.primaryReason ??
                    (result.verdict === 'DEMO_VERIFIED'
                      ? 'Deterministic fixture checks passed and Level-2 provider binding established'
                      : 'Mandatory supported checks passed and Level-2 provider binding established')}
                </p>
                {result.detail && (
                  <div className="verdict-detail-text mono text-small">{result.detail}</div>
                )}
                <div className="verdict-banner-meta">
                  <span className={`verdict-meta-pill ${walletTxs.length > 0 ? 'meta-ok' : 'meta-halt'}`}>
                    {walletTxs.length > 0
                      ? 'Wallet forwarded: 1 request'
                      : 'Wallet forwarded: 0 requests'}
                  </span>
                  <button
                    type="button"
                    className="btn-toggle-raw btn-toggle-raw-on-banner"
                    onClick={() => setShowRawData(!showRawData)}
                  >
                    <TerminalIcon size={13} />
                    <span>{showRawData ? 'Hide Raw Data' : 'View Raw Data'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="result-workspace">
              {showRawData && (
                <div className="result-raw-section">
                  <RawInspector
                    selectedScenario={selectedScenario}
                    result={result}
                    walletTxs={walletTxs}
                  />
                </div>
              )}

              <div className="result-tabs-bar">
              <button
                type="button"
                className={`result-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <FileCodeIcon size={14} />
                <span>Overview</span>
              </button>

              <button
                type="button"
                className={`result-tab-btn ${activeTab === 'calls' ? 'active' : ''}`}
                onClick={() => setActiveTab('calls')}
              >
                <GitBranchIcon size={14} />
                <span>Decoded Calls</span>
              </button>

              <button
                type="button"
                className={`result-tab-btn ${activeTab === 'evidence' ? 'active' : ''}`}
                onClick={() => setActiveTab('evidence')}
              >
                <CpuIcon size={14} />
                <span>Evidence</span>
              </button>

              <button
                type="button"
                className={`result-tab-btn ${activeTab === 'simulation' ? 'active' : ''}`}
                onClick={() => setActiveTab('simulation')}
              >
                <ActivityIcon size={14} />
                <span>Simulation</span>
              </button>

              <button
                type="button"
                className={`result-tab-btn ${activeTab === 'policy' ? 'active' : ''}`}
                onClick={() => setActiveTab('policy')}
              >
                <ScaleIcon size={14} />
                <span>Policy Checks</span>
              </button>
              </div>

              <div className="result-tab-content">
              {activeTab === 'overview' && (
                <div className="tab-pane-overview">
                  <AppRequestPanel
                    selectedScenario={selectedScenario}
                    result={result}
                    status={status}
                  />
                  <Level2Binding result={result} status={status} />
                  <PipelineHero
                    status={status}
                    result={result}
                    selectedScenario={selectedScenario}
                  />
                </div>
              )}

              {activeTab === 'calls' && (
                <div className="tab-pane-calls">
                  <CallTreePanel
                    decodeEvidence={result.evidence?.decode}
                    targetContract={String(selectedScenario.getRequest().to ?? 'Unknown')}
                    isReady={false}
                  />
                </div>
              )}

              {activeTab === 'evidence' && (
                <div className="tab-pane-evidence">
                  <EvidencePanel
                    evidence={result.evidence}
                    isReady={false}
                    section="identity"
                  />
                </div>
              )}

              {activeTab === 'simulation' && (
                <div className="tab-pane-simulation">
                  <EvidencePanel
                    evidence={result.evidence}
                    isReady={false}
                    section="simulation"
                  />
                </div>
              )}

              {activeTab === 'policy' && (
                <div className="tab-pane-policy">
                  <PolicyPanel
                    policyEvidence={result.evidence?.policy}
                    isReady={false}
                  />
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

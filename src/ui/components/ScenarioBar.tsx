import React, { useState } from 'react';
import { DEMO_SCENARIOS, type DemoScenario } from '../scenarios.js';
import { PlayIcon, RefreshIcon, ShieldAlertIcon, ShieldCheckIcon } from '../icons.js';

interface ScenarioBarProps {
  selectedScenario: DemoScenario;
  onSelectScenario: (scenario: DemoScenario) => void;
  onExecute: () => void;
  isRunning: boolean;
  executionCount: number;
  lastExecutionTimestamp: string | null;
  mode?: 'DEMO' | 'LIVE';
  onToggleMode?: (mode: 'DEMO' | 'LIVE') => void;
}

export const ScenarioBar: React.FC<ScenarioBarProps> = ({
  selectedScenario,
  onSelectScenario,
  onExecute,
  isRunning,
  executionCount,
  lastExecutionTimestamp,
  mode = 'DEMO',
  onToggleMode,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const primaryScenarios = DEMO_SCENARIOS.slice(0, 5);
  const advancedScenarios = DEMO_SCENARIOS.slice(5);

  const getCategoryColor = (category: DemoScenario['category']) => {
    switch (category) {
      case 'NORMAL':
        return 'cat-normal';
      case 'ATTACK':
        return 'cat-attack';
      case 'MUTATION':
        return 'cat-mutation';
      case 'UNVERIFIABLE':
        return 'cat-unverifiable';
      case 'UNSUPPORTED':
        return 'cat-unsupported';
      case 'BOUNDARY':
        return 'cat-boundary';
      default:
        return 'cat-default';
    }
  };

  const getCategoryIcon = (category: DemoScenario['category']) => {
    switch (category) {
      case 'NORMAL':
        return <ShieldCheckIcon size={12} color="#34d399" />;
      case 'ATTACK':
      case 'MUTATION':
        return <ShieldAlertIcon size={12} color="#f87171" />;
      default:
        return null;
    }
  };

  return (
    <section className="soc-panel soc-scenarios-panel" id="section-scenarios">
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-tag">DEMO MATRIX</span>
          <h2 className="panel-title">Transaction Threat & Functional Scenarios</h2>
        </div>
        <div className="panel-header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onToggleMode && (
            <div className="mode-toggle-pill" style={{ display: 'flex', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', overflow: 'hidden' }}>
              <button
                type="button"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  border: 'none',
                  background: mode === 'DEMO' ? '#3b82f6' : 'transparent',
                  color: mode === 'DEMO' ? '#ffffff' : '#94a3b8',
                  fontWeight: mode === 'DEMO' ? 'bold' : 'normal',
                }}
                onClick={() => onToggleMode('DEMO')}
              >
                🧪 DEMO FIXTURES
              </button>
              <button
                type="button"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  border: 'none',
                  background: mode === 'LIVE' ? '#10b981' : 'transparent',
                  color: mode === 'LIVE' ? '#ffffff' : '#94a3b8',
                  fontWeight: mode === 'LIVE' ? 'bold' : 'normal',
                }}
                onClick={() => onToggleMode('LIVE')}
              >
                ⚡ LIVE RECONNAISSANCE
              </button>
            </div>
          )}
          <span className="scenarios-legend">
            Select scenario &rarr; Inspect Staged Request &rarr; Execute Gate
          </span>
        </div>
      </div>

      {/* Primary Scenarios Grid */}
      <div className="scenarios-grid">
        {primaryScenarios.map((sc) => {
          const isActive = sc.id === selectedScenario.id;
          return (
            <button
              key={sc.id}
              className={`scenario-card ${isActive ? 'active' : ''} ${getCategoryColor(sc.category)}`}
              onClick={() => onSelectScenario(sc)}
            >
              <div className="sc-header">
                <div className="sc-id-badge">
                  {getCategoryIcon(sc.category)}
                  <span>{sc.id.toUpperCase()}</span>
                </div>
                <span className={`sc-category-tag ${getCategoryColor(sc.category)}`}>
                  {sc.category}
                </span>
              </div>
              <div className="sc-name">{sc.name}</div>
              <div className="sc-desc">{sc.shortDescription}</div>
              <div className="sc-footer">
                <span className="sc-method mono">{sc.method}</span>
                {isActive && <span className="sc-staged-pill">STAGED</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Advanced Scenarios Toggle */}
      <div className="scenarios-advanced-toggle">
        <button
          className="btn-toggle-advanced"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span>{showAdvanced ? '▲ COLLAPSE' : '▼ EXPAND'} EXTENDED THREAT LABS (SCENARIOS 6–9)</span>
          <span className="advanced-badge">CALIBRATION & BOUNDARY</span>
        </button>

        {showAdvanced && (
          <div className="scenarios-grid advanced-grid">
            {advancedScenarios.map((sc) => {
              const isActive = sc.id === selectedScenario.id;
              return (
                <button
                  key={sc.id}
                  className={`scenario-card ${isActive ? 'active' : ''} ${getCategoryColor(sc.category)}`}
                  onClick={() => onSelectScenario(sc)}
                >
                  <div className="sc-header">
                    <span className="sc-id-badge">
                      {getCategoryIcon(sc.category)}
                      <span>{sc.id.toUpperCase()}</span>
                    </span>
                    <span className={`sc-category-tag ${getCategoryColor(sc.category)}`}>
                      {sc.category}
                    </span>
                  </div>
                  <div className="sc-name">{sc.name}</div>
                  <div className="sc-desc">{sc.shortDescription}</div>
                  <div className="sc-footer">
                    <span className="sc-method mono">{sc.method}</span>
                    {isActive && <span className="sc-staged-pill">STAGED</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Execution Control & Scenario Security Analysis Bar */}
      <div className="scenario-action-bar">
        <div className="scenario-analysis-box">
          <div className="analysis-title">
            <span className="analysis-dot"></span>
            SCENARIO SECURITY ANALYSIS:
          </div>
          <p className="analysis-text">{selectedScenario.explanation}</p>
        </div>

        <div className="scenario-trigger-box">
          {executionCount > 0 && lastExecutionTimestamp && (
            <div className="execution-telemetry">
              <div className="exec-seq">
                EXECUTION <span className="text-cyan">#{executionCount}</span>
              </div>
              <div className="exec-meta">
                VIA PROXY &bull; <span className="mono text-violet">{lastExecutionTimestamp}</span>
              </div>
            </div>
          )}

          <button
            className={`soc-btn-dispatch ${isRunning ? 'running' : executionCount === 0 ? 'initial' : 'repeat'}`}
            disabled={isRunning}
            onClick={onExecute}
          >
            {isRunning ? (
              <>
                <span className="spinner"></span>
                <span>PROCESSING VIA PROXY...</span>
              </>
            ) : executionCount === 0 ? (
              <>
                <PlayIcon size={14} color="#ffffff" />
                <span>INTERCEPT & VERIFY REQUEST</span>
              </>
            ) : (
              <>
                <RefreshIcon size={14} color="#ffffff" />
                <span>RE-EXECUTE GATE</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};

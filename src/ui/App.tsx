import React, { useState, useMemo, useSyncExternalStore, useEffect } from 'react';
import { DemoRunner } from './runner.js';
import type { DemoScenario } from './scenarios.js';
import { TopBar } from './components/TopBar.js';
import { Sidebar, type NavSection } from './components/Sidebar.js';
import { ScenarioBar } from './components/ScenarioBar.js';
import { PipelineHero } from './components/PipelineHero.js';
import { VerdictDisplay } from './components/VerdictDisplay.js';
import { AppRequestPanel } from './components/AppRequestPanel.js';
import { Level2Binding } from './components/Level2Binding.js';
import { CallTreePanel } from './components/CallTreePanel.js';
import { EvidencePanel } from './components/EvidencePanel.js';
import { PolicyPanel } from './components/PolicyPanel.js';
import { RawInspector } from './components/RawInspector.js';

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

  const [activeSection, setActiveSection] = useState<NavSection>('CONSOLE');

  // Track session verified vs blocked counters
  const [sessionCounters, setSessionCounters] = useState({
    verified: 0,
    blocked: 0,
  });

  // Update session counters when execution finishes
  useEffect(() => {
    if (status === 'COMPLETED' && result) {
      if (result.verdict === 'VERIFIED' || result.verdict === 'DEMO_VERIFIED') {
        setSessionCounters((prev) => ({ ...prev, verified: prev.verified + 1 }));
      } else {
        setSessionCounters((prev) => ({ ...prev, blocked: prev.blocked + 1 }));
      }
    }
  }, [status, result, executionCount]);

  const handleReset = () => {
    runner.resetDemo();
    setSessionCounters({ verified: 0, blocked: 0 });
    setActiveSection('CONSOLE');
  };

  const handleSelectSection = (section: NavSection) => {
    setActiveSection(section);
    let targetId = '';
    switch (section) {
      case 'CONSOLE':
        targetId = 'section-scenarios';
        break;
      case 'PIPELINE':
        targetId = 'section-pipeline';
        break;
      case 'SCENARIOS':
        targetId = 'section-scenarios';
        break;
      case 'BINDING':
        targetId = 'section-binding';
        break;
      case 'EVIDENCE':
        targetId = 'section-evidence';
        break;
      case 'POLICY':
        targetId = 'section-policy';
        break;
    }
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const isRunning = status === 'RUNNING';
  const isReady = status === 'READY';

  return (
    <div className="soc-app-wrapper">
      {/* Background Matrix & Grid Overlay */}
      <div className="soc-bg-grid"></div>
      <div className="soc-bg-radial"></div>

      {/* Top Header Bar */}
      <TopBar
        executionCount={executionCount}
        verifiedCount={sessionCounters.verified}
        blockedCount={sessionCounters.blocked}
        onReset={handleReset}
      />

      {/* Main SOC Layout */}
      <div className="soc-main-layout">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
          status={status}
          hasResult={result !== null}
        />

        {/* Central Operations Canvas */}
        <main className="soc-canvas">
          {/* Scenario Selection & Execution Trigger */}
          <ScenarioBar
            selectedScenario={selectedScenario}
            onSelectScenario={(sc: DemoScenario) => runner.selectScenario(sc)}
            onExecute={() => runner.execute()}
            isRunning={isRunning}
            executionCount={executionCount}
            lastExecutionTimestamp={lastExecutionTimestamp}
          />

          {/* Dominant Final Verdict / Standby Banner */}
          <VerdictDisplay
            status={status}
            result={result}
            walletTxsCount={walletTxs.length}
          />

          {/* Central Hero: 9-Stage Live Verification Pipeline */}
          <PipelineHero
            status={status}
            result={result}
            selectedScenario={selectedScenario}
          />

          {/* Level-2 Provider Binding Comparison (Commitment A vs Commitment B) */}
          <Level2Binding
            result={result}
            status={status}
          />

          {/* Application Intent vs Captured EIP-1193 Transaction Request */}
          <AppRequestPanel
            selectedScenario={selectedScenario}
            result={result}
            status={status}
          />

          {/* Decoded Call Tree & Multicall Inspection */}
          <CallTreePanel
            decodeEvidence={result?.evidence?.decode}
            targetContract={String(selectedScenario.getRequest().to ?? 'Unknown')}
            isReady={isReady}
          />

          {/* Multi-Domain Evidence Pipeline (Sourcify, ERC-7730, Simulation) */}
          <EvidencePanel
            evidence={result?.evidence}
            isReady={isReady}
          />

          {/* Deterministic Policy Engine Rule Audit Log */}
          <PolicyPanel
            policyEvidence={result?.evidence?.policy}
            isReady={isReady}
          />

          {/* Raw JSON & Wallet Dispatch History Inspector */}
          <RawInspector
            selectedScenario={selectedScenario}
            result={result}
            walletTxs={walletTxs}
          />
        </main>
      </div>
    </div>
  );
}

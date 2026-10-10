/**
 * ActionProof Demo Execution Runner & Observability Controller
 *
 * WHAT it guarantees:
 * - Manages UI execution lifecycle: READY -> RUNNING -> COMPLETED.
 * - Selecting a scenario puts the state in READY / UNEXECUTED without calling proxy.request().
 * - Clicking "Intercept & Verify Request" executes through the real ActionProofProviderProxy.
 * - Clicking "Re-Execute Gate" re-runs proxy.request() and increments the execution counter.
 * - Records real browser runtime timestamps on every execution.
 * - Zero artificial delays or fake animations; 100% real deterministic execution.
 */

import { DEMO_SCENARIOS, type DemoScenario } from './scenarios.js';
import {
  ActionProofProviderProxy,
  MockWalletProvider,
  type ActionProofResult,
} from '../provider/index.js';
import { EvidencePipeline, createPublicLiveEvidencePipeline } from '../evidence/pipeline.js';
import { LocalFixtureSimulationAdapter } from '../analysis/simulation.js';

export interface DemoState {
  selectedScenario: DemoScenario;
  status: 'READY' | 'RUNNING' | 'COMPLETED';
  result: ActionProofResult | null;
  walletTxs: Record<string, unknown>[];
  executionCount: number;
  lastExecutionTimestamp: string | null;
  mode: 'DEMO' | 'LIVE';
}

export class DemoRunner {
  private _state: DemoState;
  private readonly _wallet: MockWalletProvider;
  private _listeners: (() => void)[] = [];
  private _isExecuting: boolean = false;

  constructor(
    initialScenario: DemoScenario = DEMO_SCENARIOS[0],
    wallet: MockWalletProvider = new MockWalletProvider(1)
  ) {
    this._wallet = wallet;
    this._state = {
      selectedScenario: initialScenario,
      status: 'READY',
      result: null,
      walletTxs: [],
      executionCount: 0,
      lastExecutionTimestamp: null,
      mode: 'DEMO',
    };
  }

  get state(): DemoState {
    return this._state;
  }

  get wallet(): MockWalletProvider {
    return this._wallet;
  }

  public setMode(mode: 'DEMO' | 'LIVE'): void {
    if (this._isExecuting || this._state.status === 'RUNNING' || this._state.mode === mode) return;
    this._state = {
      ...this._state,
      mode,
      status: 'READY',
      result: null,
      walletTxs: [],
      lastExecutionTimestamp: null,
    };
    this.notify();
  }

  public selectScenario(scenario: DemoScenario): void {
    if (this._isExecuting || this._state.status === 'RUNNING') return;
    this._wallet.reset();
    this._state = {
      ...this._state,
      selectedScenario: scenario,
      status: 'READY',
      result: null,
      walletTxs: [],
      executionCount: 0,
      lastExecutionTimestamp: null,
    };
    this.notify();
  }

  public async execute(): Promise<ActionProofResult> {
    if (this._isExecuting || this._state.status === 'RUNNING') {
      throw new Error('Execution already in progress');
    }
    this._isExecuting = true;
    this._state = {
      ...this._state,
      status: 'RUNNING',
    };
    this.notify();

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    const timestamp = `${hours}:${minutes}:${seconds}.${millis}`;

    try {
      this._wallet.reset();

      const isLive = this._state.mode === 'LIVE';
      const pipeline = isLive
        ? createPublicLiveEvidencePipeline()
        : new EvidencePipeline({
            simulationAdapter: new LocalFixtureSimulationAdapter(),
            provenanceMode: 'DEMO',
            policyEngineOptions: { provenanceMode: 'DEMO' },
          });

      const proxy = new ActionProofProviderProxy(this._wallet, {
        declaredAction: this._state.selectedScenario.declaredAction,
        evidencePipeline: pipeline,
        provenanceMode: isLive ? 'PRODUCTION' : 'DEMO',
        barrier: async (liveTx) => {
          if (this._state.selectedScenario.mutationHook) {
            this._state.selectedScenario.mutationHook(liveTx);
          }
        },
      });

      const txObj = this._state.selectedScenario.getRequest();

      const res = (await proxy.request({
        method: this._state.selectedScenario.method,
        params: [txObj],
      })) as ActionProofResult;

      this._state = {
        ...this._state,
        status: 'COMPLETED',
        result: res,
        walletTxs: [...this._wallet.received],
        executionCount: this._state.executionCount + 1,
        lastExecutionTimestamp: timestamp,
      };
      this.notify();
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const res: ActionProofResult = {
        verdict: 'BLOCKED',
        txHash: null,
        reason: 'UNHANDLED_EXCEPTION',
        detail: message,
        blockedBeforeForwarding: true,
      };

      this._state = {
        ...this._state,
        status: 'COMPLETED',
        result: res,
        walletTxs: [...this._wallet.received],
        executionCount: this._state.executionCount + 1,
        lastExecutionTimestamp: timestamp,
      };
      this.notify();
      return res;
    } finally {
      this._isExecuting = false;
    }
  }

  public resetDemo(): void {
    if (this._isExecuting || this._state.status === 'RUNNING') return;
    this._wallet.reset();
    this._state = {
      ...this._state,
      status: 'READY',
      result: null,
      walletTxs: [],
      executionCount: 0,
      lastExecutionTimestamp: null,
    };
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this._listeners) {
      listener();
    }
  }
}

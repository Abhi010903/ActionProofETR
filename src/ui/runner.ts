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
import { EvidencePipeline } from '../evidence/pipeline.js';
import { LocalFixtureSimulationAdapter } from '../analysis/simulation.js';

export interface DemoState {
  selectedScenario: DemoScenario;
  status: 'READY' | 'RUNNING' | 'COMPLETED';
  result: ActionProofResult | null;
  walletTxs: Record<string, unknown>[];
  executionCount: number;
  lastExecutionTimestamp: string | null;
}

export class DemoRunner {
  private _state: DemoState;
  private readonly _wallet: MockWalletProvider;
  private _listeners: (() => void)[] = [];

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
    };
  }

  get state(): DemoState {
    return this._state;
  }

  get wallet(): MockWalletProvider {
    return this._wallet;
  }

  public selectScenario(scenario: DemoScenario): void {
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
    this._state = {
      ...this._state,
      status: 'RUNNING',
    };
    this.notify();

    this._wallet.reset();

    const pipeline = new EvidencePipeline({
      simulationAdapter: new LocalFixtureSimulationAdapter(),
    });

    const proxy = new ActionProofProviderProxy(this._wallet, {
      declaredAction: this._state.selectedScenario.declaredAction,
      evidencePipeline: pipeline,
      barrier: async (liveTx) => {
        if (this._state.selectedScenario.mutationHook) {
          this._state.selectedScenario.mutationHook(liveTx);
        }
      },
    });

    const txObj = this._state.selectedScenario.getRequest();

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    const timestamp = `${hours}:${minutes}:${seconds}.${millis}`;

    try {
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
    }
  }

  public resetDemo(): void {
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

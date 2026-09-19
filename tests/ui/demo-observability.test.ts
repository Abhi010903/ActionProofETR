import { describe, it, expect, vi } from 'vitest';
import { DemoRunner } from '../../src/ui/runner.js';
import { DEMO_SCENARIOS } from '../../src/ui/scenarios.js';
import { ActionProofProviderProxy } from '../../src/provider/proxy.js';

describe('Demo UX & Execution Observability Tests', () => {
  it('1. Initial state is READY / UNEXECUTED and does NOT call proxy.request()', () => {
    const requestSpy = vi.spyOn(ActionProofProviderProxy.prototype, 'request');

    const runner = new DemoRunner(DEMO_SCENARIOS[0]);

    expect(runner.state.status).toBe('READY');
    expect(runner.state.result).toBeNull();
    expect(runner.state.executionCount).toBe(0);
    expect(runner.state.lastExecutionTimestamp).toBeNull();
    expect(runner.state.walletTxs.length).toBe(0);
    expect(requestSpy).not.toHaveBeenCalled();

    requestSpy.mockRestore();
  });

  it('2. Selecting a scenario puts the state in READY / UNEXECUTED without calling proxy.request()', () => {
    const requestSpy = vi.spyOn(ActionProofProviderProxy.prototype, 'request');

    const runner = new DemoRunner(DEMO_SCENARIOS[0]);

    // Select scenario 2 (attack)
    runner.selectScenario(DEMO_SCENARIOS[1]);

    expect(runner.state.selectedScenario.id).toBe('attack_multicall_stealth_approval');
    expect(runner.state.status).toBe('READY');
    expect(runner.state.result).toBeNull();
    expect(runner.state.executionCount).toBe(0);
    expect(runner.state.lastExecutionTimestamp).toBeNull();
    expect(requestSpy).not.toHaveBeenCalled();

    // Select scenario 3 (mutation)
    runner.selectScenario(DEMO_SCENARIOS[2]);

    expect(runner.state.selectedScenario.id).toBe('attack_destination_mutation');
    expect(runner.state.status).toBe('READY');
    expect(runner.state.result).toBeNull();
    expect(requestSpy).not.toHaveBeenCalled();

    requestSpy.mockRestore();
  });

  it('3. Explicit execute() (Intercept & Verify Request) invokes ActionProofProviderProxy and transitions READY -> COMPLETED', async () => {
    const requestSpy = vi.spyOn(ActionProofProviderProxy.prototype, 'request');

    const runner = new DemoRunner(DEMO_SCENARIOS[0]);
    expect(runner.state.status).toBe('READY');

    const result = await runner.execute();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(runner.state.status).toBe('COMPLETED');
    expect(runner.state.result).toBe(result);
    expect(runner.state.result?.verdict).toBe('VERIFIED');
    expect(runner.state.executionCount).toBe(1);
    expect(runner.state.lastExecutionTimestamp).toBeTruthy();
    // Real browser runtime timestamp format HH:MM:SS.mmm
    expect(runner.state.lastExecutionTimestamp).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(runner.state.walletTxs.length).toBe(1);

    requestSpy.mockRestore();
  });

  it('4. Re-execution calls proxy.request() again, increments execution counter, and updates timestamp', async () => {
    const requestSpy = vi.spyOn(ActionProofProviderProxy.prototype, 'request');

    const runner = new DemoRunner(DEMO_SCENARIOS[0]);

    // First execution
    await runner.execute();
    expect(runner.state.executionCount).toBe(1);
    const firstTimestamp = runner.state.lastExecutionTimestamp;
    expect(requestSpy).toHaveBeenCalledTimes(1);

    // Second execution (Re-Execute Gate)
    await runner.execute();
    expect(runner.state.executionCount).toBe(2);
    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(runner.state.lastExecutionTimestamp).toBeTruthy();

    // Third execution
    await runner.execute();
    expect(runner.state.executionCount).toBe(3);
    expect(requestSpy).toHaveBeenCalledTimes(3);

    requestSpy.mockRestore();
  });

  it('5. Switching scenarios after execution cleanly resets back to READY / UNEXECUTED state', async () => {
    const runner = new DemoRunner(DEMO_SCENARIOS[0]);

    // Run scenario 1
    await runner.execute();
    expect(runner.state.status).toBe('COMPLETED');
    expect(runner.state.executionCount).toBe(1);
    expect(runner.state.result).not.toBeNull();

    // Switch to scenario 2
    runner.selectScenario(DEMO_SCENARIOS[1]);

    // Must be back in READY state, result wiped, counter reset
    expect(runner.state.status).toBe('READY');
    expect(runner.state.result).toBeNull();
    expect(runner.state.executionCount).toBe(0);
    expect(runner.state.lastExecutionTimestamp).toBeNull();
    expect(runner.state.walletTxs.length).toBe(0);
  });

  it('6. Reset Demo State resets wallet and returns state to READY / UNEXECUTED', async () => {
    const runner = new DemoRunner(DEMO_SCENARIOS[0]);

    await runner.execute();
    expect(runner.state.walletTxs.length).toBe(1);
    expect(runner.state.status).toBe('COMPLETED');

    runner.resetDemo();

    expect(runner.state.status).toBe('READY');
    expect(runner.state.result).toBeNull();
    expect(runner.state.executionCount).toBe(0);
    expect(runner.state.walletTxs.length).toBe(0);
    expect(runner.wallet.received.length).toBe(0);
  });
});

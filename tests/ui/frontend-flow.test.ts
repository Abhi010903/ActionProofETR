import { describe, it, expect } from 'vitest';
import { DEMO_SCENARIOS } from '../../src/ui/scenarios.js';
import { DemoRunner } from '../../src/ui/runner.js';

describe('Frontend Redesign Flow & Scenario Invariants', () => {
  const PRIMARY_DASHBOARD_IDS = [
    'normal_swap',
    'attack_multicall_stealth_approval',
    'unknown_calldata',
    'attack_value_mutation',
    'attack_calldata_mutation',
  ] as const;

  it('1. Maps the exact five primary dashboard test scenarios requested in the specification', () => {
    const primaryScenarios = PRIMARY_DASHBOARD_IDS.map((id) =>
      DEMO_SCENARIOS.find((s) => s.id === id)
    );

    expect(primaryScenarios.every(Boolean)).toBe(true);
    expect(primaryScenarios.length).toBe(5);

    // 1. Normal Supported Swap
    expect(primaryScenarios[0]?.id).toBe('normal_swap');
    expect(primaryScenarios[0]?.category).toBe('NORMAL');

    // 2. Swap + Malicious Approval
    expect(primaryScenarios[1]?.id).toBe('attack_multicall_stealth_approval');
    expect(primaryScenarios[1]?.category).toBe('ATTACK');

    // 3. Unknown / Unverified Contract
    expect(primaryScenarios[2]?.id).toBe('unknown_calldata');
    expect(primaryScenarios[2]?.category).toBe('UNVERIFIABLE');

    // 4. Value Transfer
    expect(primaryScenarios[3]?.id).toBe('attack_value_mutation');
    expect(primaryScenarios[3]?.category).toBe('MUTATION');

    // 5. Custom Calldata
    expect(primaryScenarios[4]?.id).toBe('attack_calldata_mutation');
    expect(primaryScenarios[4]?.category).toBe('MUTATION');
  });

  it('2. Scenario 1 (Normal Supported Swap) executes through proxy to DEMO_VERIFIED and dispatches 1 wallet tx', async () => {
    const sc = DEMO_SCENARIOS.find((s) => s.id === 'normal_swap')!;
    const runner = new DemoRunner(sc);
    expect(runner.state.status).toBe('READY');
    expect(runner.state.result).toBeNull();

    const res = await runner.execute();
    expect(res.verdict).toBe('DEMO_VERIFIED');
    expect(runner.state.status).toBe('COMPLETED');
    expect(runner.state.walletTxs.length).toBe(1);
    expect(res.evidence?.policy.primaryReason).toContain('passed');
  });

  it('3. Scenario 2 (Swap + Malicious Approval) executes to BLOCKED with 0 wallet requests forwarded', async () => {
    const sc = DEMO_SCENARIOS.find((s) => s.id === 'attack_multicall_stealth_approval')!;
    const runner = new DemoRunner(sc);
    const res = await runner.execute();

    expect(res.verdict).toBe('BLOCKED');
    expect(runner.state.walletTxs.length).toBe(0);
    expect(res.blockedBeforeForwarding).toBe(true);
    expect(res.reason).toContain('Exact unlimited token approval');
  });

  it('4. Scenario 3 (Unknown / Unverified Contract) executes to BLOCKED (Fail-Closed) with 0 wallet requests', async () => {
    const sc = DEMO_SCENARIOS.find((s) => s.id === 'unknown_calldata')!;
    const runner = new DemoRunner(sc);
    const res = await runner.execute();

    expect(res.verdict).toBe('BLOCKED');
    expect(runner.state.walletTxs.length).toBe(0);
    expect(res.evidence?.decode.status).toBe('UNKNOWN_CALLDATA');
    expect(res.blockedBeforeForwarding).toBe(true);
  });

  it('5. Scenario 4 (Value Transfer: 0 ETH -> 10 ETH) detects commitment mismatch and executes to BLOCKED', async () => {
    const sc = DEMO_SCENARIOS.find((s) => s.id === 'attack_value_mutation')!;
    const runner = new DemoRunner(sc);
    const res = await runner.execute();

    expect(res.verdict).toBe('BLOCKED');
    expect(res.reason).toBe('COMMITMENT_MISMATCH');
    expect(runner.state.walletTxs.length).toBe(0);
    expect(res.forwardCommitment).toBeTruthy();
    expect(res.commitment).not.toBe(res.forwardCommitment);
  });

  it('6. Scenario 5 (Custom Calldata Mutation) detects commitment mismatch and executes to BLOCKED', async () => {
    const sc = DEMO_SCENARIOS.find((s) => s.id === 'attack_calldata_mutation')!;
    const runner = new DemoRunner(sc);
    const res = await runner.execute();

    expect(res.verdict).toBe('BLOCKED');
    expect(res.reason).toBe('COMMITMENT_MISMATCH');
    expect(runner.state.walletTxs.length).toBe(0);
    expect(res.forwardCommitment).toBeTruthy();
    expect(res.commitment).not.toBe(res.forwardCommitment);
  });

  it('7. Preserves remaining scenarios in the extended threat labs without regressions', async () => {
    const extendedIds = ['attack_destination_mutation', 'unsupported_eip7702', 'unsupported_eip5792', 'boundary_bypass_demo'];
    const extended = DEMO_SCENARIOS.filter((s) => extendedIds.includes(s.id));
    expect(extended.length).toBe(4);

    // Verify Destination Mutation still detects Level-2 divergence
    const destMutation = DEMO_SCENARIOS.find((s) => s.id === 'attack_destination_mutation')!;
    const runnerDest = new DemoRunner(destMutation);
    const resDest = await runnerDest.execute();
    expect(resDest.verdict).toBe('BLOCKED');
    expect(resDest.reason).toBe('COMMITMENT_MISMATCH');

    // Verify EIP-7702 is marked UNSUPPORTED
    const eip7702 = DEMO_SCENARIOS.find((s) => s.id === 'unsupported_eip7702')!;
    const runner7702 = new DemoRunner(eip7702);
    const res7702 = await runner7702.execute();
    expect(res7702.verdict).toBe('UNSUPPORTED');
  });
});

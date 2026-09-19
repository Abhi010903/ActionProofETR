import { describe, it, expect } from 'vitest';
import { DeterministicPolicyEngine, DETERMINISTIC_POLICY_RULES } from '../../src/policy/index.js';
import type { CompleteEvidence } from '../../src/evidence/types.js';

function createMockEvidence(): Omit<CompleteEvidence, 'policy'> {
  return {
    application: {
      status: 'AVAILABLE',
      declaredAction: 'Swap 100 USDC -> ETH',
      source: 'DAPP_UI',
      isUntrustedClaim: true,
    },
    transaction: {
      status: 'CAPTURED',
      canonical: {
        domain: 'actionproof.request.v1',
        type: '0x2',
        from: '0x04f8996da763b7a969b1028ee3007569eaf3a635',
        to: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
        value: '0x0',
        data: '0x04e45aaf',
        chainId: 1,
        nonce: null,
        gas: null,
        gasPrice: null,
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
        accessList: [],
      },
      activeChainId: 1,
    },
    binding: {
      status: 'MATCH',
      level: 'LEVEL_2',
      finalSignedPayloadNotice: 'OUTSIDE_MVP',
      verifiedCommitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      forwardCommitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      mismatchReason: null,
    },
    decode: {
      status: 'DECODED',
      functionName: 'exactInputSingle',
      signature: 'exactInputSingle(...)',
      args: { amountIn: '100000000' },
      callTree: [],
      detectedApprovals: [],
      hasExactUnlimitedApproval: false,
      hasHighValueApproval: false,
    },
    contract: {
      status: 'VERIFIED_CORRESPONDENCE',
      provenance: 'LOCAL_FIXTURE',
      sourceDescription: 'verified source/bytecode correspondence fixture',
      address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
      matchType: 'FULL_MATCH',
      contractName: 'SwapRouter02',
      compiler: 'v0.7.6',
      disclaimer: 'Sourcify verified source/bytecode correspondence evidence. Does NOT establish contract safety.',
    },
    intent: {
      status: 'DESCRIPTOR_FOUND',
      provenance: 'LOCAL_FIXTURE',
      schemaVersion: '2.0.0',
      descriptorId: 'uniswap.swap',
      intentDisplay: 'Swap 100 USDC for ETH',
      matchedFields: { amountIn: '100000000' },
      crossValidation: {
        performed: true,
        matches: true,
        discrepancies: [],
      },
      disclaimer: 'Advisory semantic evidence only. Does not guarantee safety.',
    },
    simulation: {
      status: 'FIXTURE_SIMULATION',
      provenance: 'LOCAL_FIXTURE',
      blockNumber: 20780100,
      stateContext: { timestamp: 1720000000, baseFee: '15.5 Gwei' },
      success: true,
      gasUsed: '120000',
      assetChanges: [],
      revertReason: null,
      disclaimer: 'State-specific execution evidence at block X.',
    },
  };
}

describe('Deterministic Policy Engine Tests', () => {
  it('pure determinism: evaluates to VERIFIED consistently without deviation', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();

    const verdict1 = engine.evaluate(evidence);
    const verdict2 = engine.evaluate(evidence);

    expect(verdict1.verdict).toBe('VERIFIED');
    expect(verdict2.verdict).toBe('VERIFIED');
    expect(verdict1.primaryReason).toBe(verdict2.primaryReason);
    expect(verdict1.rulesEvaluated.length).toBe(verdict2.rulesEvaluated.length);
  });

  it('fails closed when binding status is MISMATCH', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.binding.status = 'MISMATCH';
    evidence.binding.mismatchReason = 'Transaction parameters mutated';

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/commitment mismatch/i);
  });

  it('fails closed when EXACT_UNLIMITED approval is detected', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.decode.hasExactUnlimitedApproval = true;
    evidence.decode.detectedApprovals = [{
      token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      spender: '0xe64ba38a4b958c72bc0d421150ba464636422485',
      amount: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
      classification: 'EXACT_UNLIMITED',
      isExactUnlimited: true,
      isHighValue: false,
    }];

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/exact unlimited/i);
  });

  it('fails closed when HIGH_VALUE_APPROVAL is detected and blockHighValueApprovals is enabled', () => {
    const engine = new DeterministicPolicyEngine({ blockHighValueApprovals: true });
    const evidence = createMockEvidence();
    evidence.decode.hasHighValueApproval = true;
    evidence.decode.detectedApprovals = [{
      token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      spender: '0xe64ba38a4b958c72bc0d421150ba464636422485',
      amount: '100000000000000000000000000000000',
      classification: 'HIGH_VALUE_APPROVAL',
      isExactUnlimited: false,
      isHighValue: true,
    }];

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/high-value/i);
  });

  it('fails closed when application claims Swap but call tree is approve()', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.decode.functionName = 'approve';

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/deceptive ui claim/i);
  });

  it('fails closed when simulation reverts', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.simulation.status = 'REVERTED';
    evidence.simulation.success = false;
    evidence.simulation.revertReason = 'Execution reverted: TRANSFER_FAILED';

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/TRANSFER_FAILED/i);
  });

  it('Simulation Honesty: emits WARNING (degraded evidence) when simulation is UNAVAILABLE', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.simulation.status = 'UNAVAILABLE';
    evidence.simulation.success = false;
    evidence.simulation.revertReason = 'No live EVM simulation backend configured';

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('WARNING');
    expect(verdict.warnings.some(w => w.includes('Simulation evidence unavailable'))).toBe(true);
  });

  it('emits WARNING (degraded evidence) when contract is unverified on Sourcify', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.contract.status = 'UNVERIFIED';

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('WARNING');
    expect(verdict.warnings.some(w => w.includes('Sourcify'))).toBe(true);
  });

  it('fails closed when ERC-7730 descriptor cross-validation detects a mismatch', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.intent.status = 'DESCRIPTOR_MISMATCH';
    evidence.intent.crossValidation = {
      performed: true,
      matches: false,
      discrepancies: ['Missing expected field: recipient'],
    };

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/descriptor cross-validation failed/i);
  });

  it('fails closed with BLOCKED when transaction calldata is UNKNOWN_CALLDATA (fail-closed default)', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.decode.status = 'UNKNOWN_CALLDATA';
    evidence.decode.functionName = null;
    evidence.decode.signature = '0x12345678';

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/Unrecognized calldata selector \(0x12345678\)/i);
    expect(verdict.blockedReasons.length).toBeGreaterThan(0);
  });

  it('emits WARNING for UNKNOWN_CALLDATA when allowUnknownCalldata is explicitly enabled', () => {
    const engine = new DeterministicPolicyEngine({ allowUnknownCalldata: true });
    const evidence = createMockEvidence();
    evidence.decode.status = 'UNKNOWN_CALLDATA';
    evidence.decode.functionName = null;
    evidence.decode.signature = '0x12345678';

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('WARNING');
    expect(verdict.warnings.some(w => w.includes('0x12345678'))).toBe(true);
  });
});

describe('RULE_04 Application Intent Alignment Contradiction Tests', () => {
  const getRule04 = () => DETERMINISTIC_POLICY_RULES.find(r => r.id === 'RULE_04_APPLICATION_INTENT_ALIGNMENT')!;

  it('swap + approve => BLOCKED', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.decode.functionName = 'approve';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      functionName: 'approve',
      signature: 'approve(...)',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(false);
    expect(ruleResult.verdictContribution).toBe('BLOCKED');
    expect(ruleResult.reason).toMatch(/deceptive ui claim/i);
    expect(ruleResult.reason).toMatch(/approve/i);

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
  });

  it('transfer + approve => BLOCKED', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.decode.functionName = 'approve';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      functionName: 'approve',
      signature: 'approve(...)',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(false);
    expect(ruleResult.verdictContribution).toBe('BLOCKED');
    expect(ruleResult.reason).toMatch(/deceptive ui claim/i);
    expect(ruleResult.reason).toMatch(/approve/i);

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
  });

  it('payment + approve => BLOCKED', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Payment for goods';
    evidence.decode.functionName = 'approve';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      functionName: 'approve',
      signature: 'approve(...)',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(false);
    expect(ruleResult.verdictContribution).toBe('BLOCKED');
    expect(ruleResult.reason).toMatch(/deceptive ui claim/i);
    expect(ruleResult.reason).toMatch(/approve/i);

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
  });

  it('approval + swap => BLOCKED', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve router';
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
      functionName: 'exactInputSingle',
      signature: 'exactInputSingle(...)',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(false);
    expect(ruleResult.verdictContribution).toBe('BLOCKED');
    expect(ruleResult.reason).toMatch(/deceptive ui claim/i);
    expect(ruleResult.reason).toMatch(/exactInputSingle/i);

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
  });

  it('swap + transfer => BLOCKED', () => {
    const engine = new DeterministicPolicyEngine();
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.decode.functionName = 'transfer';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      functionName: 'transfer',
      signature: 'transfer(...)',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(false);
    expect(ruleResult.verdictContribution).toBe('BLOCKED');
    expect(ruleResult.reason).toMatch(/deceptive ui claim/i);
    expect(ruleResult.reason).toMatch(/transfer/i);

    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
  });

  it('transfer + transfer => NOT BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.decode.functionName = 'transfer';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      functionName: 'transfer',
      signature: 'transfer(...)',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(true);
  });

  it('swap + recognized swap => NOT BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
      functionName: 'exactInputSingle',
      signature: 'exactInputSingle(...)',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(true);
  });

  it('custom/unknown declared action + unknown decoded action => NOT BLOCKED by RULE_04', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Execute custom contract interaction';
    evidence.decode.status = 'UNKNOWN_CALLDATA';
    evidence.decode.functionName = null;
    evidence.decode.signature = '0x12345678';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0x1111111111111111111111111111111111111111',
      functionName: 'unknown_0x12345678',
      signature: '0x12345678',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(true);
  });

  it('claim rewards + transferFrom => NOT BLOCKED by RULE_04', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'claim rewards';
    evidence.decode.functionName = 'transferFrom';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      functionName: 'transferFrom',
      signature: 'transferFrom(...)',
      args: {},
      isDangerous: false,
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(true);
  });

  it('multicall containing approve while declared swap => BLOCKED if existing callTree supports this deterministically', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.decode.status = 'MULTICALL_DECODED';
    evidence.decode.functionName = 'multicall';
    evidence.decode.callTree = [{
      index: 0,
      depth: 0,
      target: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
      functionName: 'multicall',
      signature: 'multicall(2 calls)',
      args: {},
      isDangerous: false,
      children: [
        {
          index: 0,
          depth: 1,
          target: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
          functionName: 'exactInputSingle',
          signature: 'exactInputSingle(...)',
          args: {},
          isDangerous: false,
        },
        {
          index: 1,
          depth: 1,
          target: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          functionName: 'approve',
          signature: 'approve(...)',
          args: {},
          isDangerous: false,
        },
      ],
    }];

    const ruleResult = getRule04().evaluate(evidence, {});
    expect(ruleResult.passed).toBe(false);
    expect(ruleResult.verdictContribution).toBe('BLOCKED');
    expect(ruleResult.reason).toMatch(/deceptive ui claim/i);
    expect(ruleResult.reason).toMatch(/approve/i);
  });
});


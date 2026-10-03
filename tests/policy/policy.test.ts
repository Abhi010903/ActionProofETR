import { describe, it, expect } from 'vitest';
import { encodeFunctionData, parseAbi } from 'viem';
import { DeterministicPolicyEngine, DETERMINISTIC_POLICY_RULES } from '../../src/policy/index.js';
import type { CompleteEvidence } from '../../src/evidence/types.js';
import {
  KNOWN_ERC20_ABI,
  UINT256_MAX,
  DESIGN_DECISION_HIGH_VALUE_THRESHOLD_TOKENS,
  FALLBACK_RAW_HIGH_VALUE_THRESHOLD,
  classifyApproval,
  normalizeTokenAmount,
  decodeTransactionCalldata,
} from '../../src/analysis/decoder.js';
import { getTrustedTokenDecimals } from '../../src/analysis/contract.js';

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
      args: {
        amountIn: '100000000',
        recipient: '0x04f8996da763b7a969b1028ee3007569eaf3a635',
      },
      callTree: [],
      detectedApprovals: [],
      hasExactUnlimitedApproval: false,
      hasHighValueApproval: false,
    },
    contract: {
      status: 'VERIFIED_CORRESPONDENCE',
      provenance: 'LIVE_EXTERNAL',
      sourceDescription: 'verified source/bytecode correspondence fixture',
      address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
      matchType: 'FULL_MATCH',
      contractName: 'SwapRouter02',
      compiler: 'v0.7.6',
      disclaimer: 'Sourcify verified source/bytecode correspondence evidence. Does NOT establish contract safety.',
    },
    intent: {
      status: 'DESCRIPTOR_FOUND',
      provenance: 'LIVE_REGISTRY',
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
      status: 'LIVE_SIMULATED',
      provenance: 'LIVE_BACKEND',
      blockNumber: 20780100,
      stateContext: { timestamp: 1720000000, baseFee: '15.5 Gwei' },
      success: true,
      gasUsed: '120000',
      assetChanges: [],
      revertReason: null,
      disclaimer: 'Live simulated execution evidence.',
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

  it('claim rewards + transferFrom => BLOCKED by RULE_04 (unmapped intent fails closed)', () => {
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
    expect(ruleResult.passed).toBe(false);
    expect(ruleResult.verdictContribution).toBe('BLOCKED');
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

describe('H1: Structured Intent Default-Deny Specification', () => {
  const getRule04 = () => DETERMINISTIC_POLICY_RULES.find(r => r.id === 'RULE_04_APPLICATION_INTENT_ALIGNMENT')!;
  const ALICE = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
  const BOB = '0x1111111111111111111111111111111111111111' as const;
  const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;

  it('H1-1: Valid SWAP intent matches swap calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ALICE }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('H1-2: Valid TRANSFER intent matches transfer calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.decode.functionName = 'transfer';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: BOB, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: BOB }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('H1-3: Valid APPROVE intent matches approve calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve Uniswap Router';
    evidence.decode.functionName = 'approve';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ROUTER }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('H1-4: SWAP intent BLOCKS transfer calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.decode.functionName = 'transfer';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: BOB, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: BOB }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
  });

  it('H1-5: SWAP intent BLOCKS approve calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.decode.functionName = 'approve';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ROUTER }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
  });

  it('H1-6: TRANSFER intent BLOCKS swap calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ALICE }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
  });

  it('H1-7: TRANSFER intent BLOCKS approve calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.decode.functionName = 'approve';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ROUTER }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
  });

  it('H1-8: APPROVE intent BLOCKS swap calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve router';
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ALICE }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
  });

  it('H1-9: APPROVE intent BLOCKS transfer calldata', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve router';
    evidence.decode.functionName = 'transfer';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: BOB, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: BOB }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
  });

  it('H1-10: Unmapped intent string fails closed with BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Claim rewards from staking pool';
    evidence.decode.functionName = 'transferFrom';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: BOB, functionName: 'transferFrom', signature: 'transferFrom(...)',
      args: { to: BOB }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/unmapped or ambiguous/i);
  });

  it('H1-11: Empty/missing declaredAction fails closed with BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = '';
    evidence.application.structuredIntent = null;
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ALICE }, isDangerous: false,
    }];
    const res = getRule04().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
  });
});

describe('H2: Recipient / Destination Binding Specification', () => {
  const getRule09 = () => DETERMINISTIC_POLICY_RULES.find(r => r.id === 'RULE_09_RECIPIENT_INTEGRITY')!;
  const ALICE = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
  const BOB = '0x1111111111111111111111111111111111111111' as const;
  const ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485' as const;
  const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;

  it('H2-1: Swap with recipient == tx.from passes', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.transaction.canonical = { ...evidence.transaction.canonical, from: ALICE };
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.args = { recipient: ALICE };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ALICE }, isDangerous: false,
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('H2-2: Swap with explicit expectedRecipient matching swap output recipient passes', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.application.structuredIntent = {
      category: 'SWAP',
      expectedRecipient: BOB,
    };
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.args = { recipient: BOB };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: BOB }, isDangerous: false,
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('H2-3: Swap with recipient != tx.from (and no explicit override) is BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.transaction.canonical = { ...evidence.transaction.canonical, from: ALICE };
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.args = { recipient: ATTACKER };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ATTACKER }, isDangerous: false,
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Recipient mismatch/i);
  });

  it('H2-4: Swap with recipient != expectedRecipient (with explicit override) is BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.application.structuredIntent = {
      category: 'SWAP',
      expectedRecipient: BOB,
    };
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.args = { recipient: ATTACKER };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ATTACKER }, isDangerous: false,
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Recipient mismatch/i);
  });

  it('H2-5: Transfer to expectedRecipient passes', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.application.structuredIntent = {
      category: 'TRANSFER',
      expectedRecipient: BOB,
    };
    evidence.decode.functionName = 'transfer';
    evidence.decode.args = { to: BOB };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: BOB, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: BOB }, isDangerous: false,
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('H2-6: Transfer to different recipient is BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.application.structuredIntent = {
      category: 'TRANSFER',
      expectedRecipient: BOB,
    };
    evidence.decode.functionName = 'transfer';
    evidence.decode.args = { to: ATTACKER };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: BOB, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: ATTACKER }, isDangerous: false,
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Recipient mismatch/i);
  });

  it('H2-7: Approve with expectedSpender passes', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve router';
    evidence.application.structuredIntent = {
      category: 'APPROVE',
      expectedSpender: ROUTER,
    };
    evidence.decode.functionName = 'approve';
    evidence.decode.args = { spender: ROUTER };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ROUTER }, isDangerous: false,
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('H2-8: Approve with different spender is BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve router';
    evidence.application.structuredIntent = {
      category: 'APPROVE',
      expectedSpender: ROUTER,
    };
    evidence.decode.functionName = 'approve';
    evidence.decode.args = { spender: ATTACKER };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ATTACKER }, isDangerous: false,
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Spender mismatch/i);
  });

  it('H2-9: Multicall with nested swap sending to third party is BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.transaction.canonical = { ...evidence.transaction.canonical, from: ALICE };
    evidence.decode.status = 'MULTICALL_DECODED';
    evidence.decode.functionName = 'multicall';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'multicall', signature: 'multicall(...)',
      args: {}, isDangerous: false,
      children: [
        {
          index: 0, depth: 1, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
          args: { recipient: ATTACKER }, isDangerous: false,
        },
      ],
    }];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Recipient mismatch/i);
  });

  it('H2-10: Direct native ETH transfer with declared SWAP intent is BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.transaction.canonical = {
      ...evidence.transaction.canonical,
      data: '0x',
      value: '0xde0b6b3a7640000', // 1 ETH
      to: ATTACKER,
    };
    evidence.decode.status = 'EMPTY_CALLDATA';
    evidence.decode.functionName = null;
    evidence.decode.callTree = [];

    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Deceptive destination/i);
  });
});

describe('H2 Remediation: Destination and Spender Binding Enforcement', () => {
  const getRule09 = () => DETERMINISTIC_POLICY_RULES.find(r => r.id === 'RULE_09_RECIPIENT_INTEGRITY')!;
  const ALICE = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
  const BOB = '0x1111111111111111111111111111111111111111' as const;
  const ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485' as const;
  const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;

  it('Remediation 1: Free-text "Transfer 10 USDC" + transfer(attacker) => BLOCKED with UNBOUND_TRANSFER_DESTINATION', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.decode.functionName = 'transfer';
    evidence.decode.args = { to: ATTACKER, amount: '10000000' };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: USDC, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: ATTACKER }, isDangerous: false,
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/UNBOUND_TRANSFER_DESTINATION/i);
  });

  it('Remediation 2: Structured TRANSFER + expectedRecipient = sender + transfer(sender) => allowed by RULE_09', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.application.structuredIntent = {
      category: 'TRANSFER',
      expectedRecipient: ALICE,
    };
    evidence.decode.functionName = 'transfer';
    evidence.decode.args = { to: ALICE, amount: '10000000' };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: USDC, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: ALICE }, isDangerous: false,
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('Remediation 3: Structured TRANSFER + expectedRecipient = trusted recipient + transfer(attacker) => BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.application.structuredIntent = {
      category: 'TRANSFER',
      expectedRecipient: BOB,
    };
    evidence.decode.functionName = 'transfer';
    evidence.decode.args = { to: ATTACKER, amount: '10000000' };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: USDC, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: ATTACKER }, isDangerous: false,
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Recipient mismatch/i);
  });

  it('Remediation 4: Structured TRANSFER + expectedRecipient mismatch => BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.application.structuredIntent = {
      category: 'TRANSFER',
      expectedRecipient: BOB,
    };
    evidence.decode.functionName = 'transfer';
    evidence.decode.args = { to: ROUTER, amount: '10000000' };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: USDC, functionName: 'transfer', signature: 'transfer(...)',
      args: { to: ROUTER }, isDangerous: false,
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Recipient mismatch/i);
  });

  it('Remediation 5: Free-text "Approve token" + approve(attacker, standard amount) => BLOCKED with UNBOUND_APPROVAL_SPENDER', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve token';
    evidence.decode.functionName = 'approve';
    evidence.decode.args = { spender: ATTACKER, amount: '1000' };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: USDC, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ATTACKER }, isDangerous: false,
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/UNBOUND_APPROVAL_SPENDER/i);
  });

  it('Remediation 6: Structured APPROVE + expectedSpender = trusted spender + approve(trusted spender) => allowed by RULE_09', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve router';
    evidence.application.structuredIntent = {
      category: 'APPROVE',
      expectedSpender: ROUTER,
    };
    evidence.decode.functionName = 'approve';
    evidence.decode.args = { spender: ROUTER, amount: '1000' };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: USDC, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ROUTER }, isDangerous: false,
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(true);
  });

  it('Remediation 7: Structured APPROVE + expectedSpender = trusted spender + approve(attacker) => BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve router';
    evidence.application.structuredIntent = {
      category: 'APPROVE',
      expectedSpender: ROUTER,
    };
    evidence.decode.functionName = 'approve';
    evidence.decode.args = { spender: ATTACKER, amount: '1000' };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: USDC, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ATTACKER }, isDangerous: false,
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Spender mismatch/i);
  });

  it('Remediation 8: Existing unlimited approval test => still BLOCKED by RULE_02A', () => {
    const evidence = createMockEvidence();
    evidence.decode.hasExactUnlimitedApproval = true;
    evidence.decode.detectedApprovals = [{
      token: USDC,
      spender: ROUTER,
      amount: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
      classification: 'EXACT_UNLIMITED',
      isExactUnlimited: true,
      isHighValue: false,
    }];
    const engine = new DeterministicPolicyEngine();
    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/exact unlimited/i);
  });

  it('Remediation 9: Existing high-value approval test => still behaves identically', () => {
    const evidence = createMockEvidence();
    evidence.decode.hasHighValueApproval = true;
    evidence.decode.detectedApprovals = [{
      token: USDC,
      spender: ROUTER,
      amount: '100000000000000000000000000000000',
      classification: 'HIGH_VALUE_APPROVAL',
      isExactUnlimited: false,
      isHighValue: true,
    }];
    const engine = new DeterministicPolicyEngine({ blockHighValueApprovals: true });
    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('BLOCKED');
    expect(verdict.primaryReason).toMatch(/high-value/i);
  });

  it('Remediation 10: Multicall with declared TRANSFER + transfer(attacker) => BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Transfer 10 USDC';
    evidence.decode.status = 'MULTICALL_DECODED';
    evidence.decode.functionName = 'multicall';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'multicall', signature: 'multicall(...)',
      args: {}, isDangerous: false,
      children: [
        {
          index: 0, depth: 1, target: USDC, functionName: 'transfer', signature: 'transfer(...)',
          args: { to: ATTACKER }, isDangerous: false,
        },
      ],
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/UNBOUND_TRANSFER_DESTINATION/i);
  });

  it('Remediation 11: Multicall with declared APPROVE + approve(attacker) => BLOCKED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve token';
    evidence.decode.status = 'MULTICALL_DECODED';
    evidence.decode.functionName = 'multicall';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'multicall', signature: 'multicall(...)',
      args: {}, isDangerous: false,
      children: [
        {
          index: 0, depth: 1, target: USDC, functionName: 'approve', signature: 'approve(...)',
          args: { spender: ATTACKER }, isDangerous: false,
        },
      ],
    }];
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/UNBOUND_APPROVAL_SPENDER/i);
  });

  it('Remediation 12: Normal swap tests remain unchanged and evaluate to VERIFIED', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.transaction.canonical = { ...evidence.transaction.canonical, from: ALICE };
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.args = { amountIn: '100000000', recipient: ALICE };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ALICE }, isDangerous: false,
    }];
    const engine = new DeterministicPolicyEngine();
    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('VERIFIED');
  });
});

describe('H5 Remediation: Decimal-Aware Approval Thresholds and Evidence Invariants', () => {
  const ALICE = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
  const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
  const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as const;
  const ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485' as const;
  const UNKNOWN_TOKEN = '0x9999999999999999999999999999999999999999' as const;

  const getRule02A = () => DETERMINISTIC_POLICY_RULES.find(r => r.id === 'RULE_02A_NO_EXACT_UNLIMITED_APPROVALS')!;
  const getRule02B = () => DETERMINISTIC_POLICY_RULES.find(r => r.id === 'RULE_02B_HIGH_VALUE_APPROVAL_CHECK')!;
  const getRule09 = () => DETERMINISTIC_POLICY_RULES.find(r => r.id === 'RULE_09_RECIPIENT_INTEGRITY')!;

  it('H5-1: uint256.max is always classified as EXACT_UNLIMITED and BLOCKED regardless of decimals', () => {
    // Decimals = 6 (e.g. USDC)
    const res6 = classifyApproval(UINT256_MAX, 6);
    expect(res6.classification).toBe('EXACT_UNLIMITED');
    expect(res6.isExactUnlimited).toBe(true);
    expect(res6.isHighValue).toBe(false);

    // Decimals = 18 (e.g. WETH)
    const res18 = classifyApproval(UINT256_MAX, 18);
    expect(res18.classification).toBe('EXACT_UNLIMITED');
    expect(res18.isExactUnlimited).toBe(true);

    // Decimals = null (unavailable)
    const resNull = classifyApproval(UINT256_MAX, null);
    expect(resNull.classification).toBe('EXACT_UNLIMITED');
    expect(resNull.isExactUnlimited).toBe(true);

    // Policy evaluation under RULE_02A
    const evidence = createMockEvidence();
    evidence.decode.hasExactUnlimitedApproval = true;
    evidence.decode.detectedApprovals = [{
      token: USDC,
      spender: ROUTER,
      amount: UINT256_MAX.toString(),
      classification: 'EXACT_UNLIMITED',
      isExactUnlimited: true,
      isHighValue: false,
      decimals: 6,
      normalizedAmount: res6.normalizedAmount,
      decimalsAvailable: true,
    }];

    const evalResult = getRule02A().evaluate(evidence, {});
    expect(evalResult.passed).toBe(false);
    expect(evalResult.verdictContribution).toBe('BLOCKED');
    expect(evalResult.severity).toBe('FATAL');
    expect(evalResult.reason).toMatch(/exact unlimited/i);
  });

  it('H5-2: Known decimals = 6: raw amount representing high human-readable approval => HIGH_VALUE_APPROVAL', () => {
    // Previously, 10^29 base units on USDC was classified as STANDARD because 10^29 < 10^30.
    // With 6 decimals, 10^29 base units is 10^23 whole USDC tokens (>> 1,000,000 policy threshold).
    const rawHugeUnits = 10n ** 29n;
    const res = classifyApproval(rawHugeUnits, 6);
    expect(res.classification).toBe('HIGH_VALUE_APPROVAL');
    expect(res.isHighValue).toBe(true);
    expect(res.isExactUnlimited).toBe(false);
    expect(res.decimals).toBe(6);
    expect(res.decimalsAvailable).toBe(true);
    expect(res.normalizedAmount).toBe('100000000000000000000000');

    // 2,000,000 USDC (2M whole tokens with 6 decimals = 2 * 10^12 base units)
    const raw2M = 2_000_000_000_000n;
    const res2M = classifyApproval(raw2M, 6);
    expect(res2M.classification).toBe('HIGH_VALUE_APPROVAL');
    expect(res2M.isHighValue).toBe(true);
    expect(res2M.normalizedAmount).toBe('2000000');

    // Evaluated under RULE_02B
    const evidence = createMockEvidence();
    evidence.decode.hasHighValueApproval = true;
    evidence.decode.detectedApprovals = [{
      token: USDC,
      spender: ROUTER,
      amount: raw2M.toString(),
      classification: 'HIGH_VALUE_APPROVAL',
      isExactUnlimited: false,
      isHighValue: true,
      decimals: 6,
      normalizedAmount: res2M.normalizedAmount,
      decimalsAvailable: true,
    }];

    // Fail-closed when blocking high value approvals
    const blockedResult = getRule02B().evaluate(evidence, { blockHighValueApprovals: true });
    expect(blockedResult.passed).toBe(false);
    expect(blockedResult.verdictContribution).toBe('BLOCKED');
    expect(blockedResult.reason).toMatch(/high-value/i);

    // Warning when non-blocking option is specified
    const warningResult = getRule02B().evaluate(evidence, { blockHighValueApprovals: false });
    expect(warningResult.passed).toBe(true);
    expect(warningResult.verdictContribution).toBe('WARNING');
  });

  it('H5-3: Known decimals = 18: equivalent human-readable approval gets same policy classification', () => {
    // 2,000,000 whole tokens with 18 decimals (2 * 10^24 base units)
    const raw18_2M = 2_000_000n * (10n ** 18n);
    const res18 = classifyApproval(raw18_2M, 18);
    expect(res18.classification).toBe('HIGH_VALUE_APPROVAL');
    expect(res18.isHighValue).toBe(true);
    expect(res18.decimals).toBe(18);
    expect(res18.decimalsAvailable).toBe(true);
    expect(res18.normalizedAmount).toBe('2000000');

    // Compare against 6-decimal 2,000,000 token approval: both normalized to 2000000
    const raw6_2M = 2_000_000n * (10n ** 6n);
    const res6 = classifyApproval(raw6_2M, 6);
    expect(res6.classification).toBe(res18.classification);
    expect(res6.normalizedAmount).toBe(res18.normalizedAmount);
  });

  it('H5-4: Same raw amount with different decimals demonstrates normalized classification', () => {
    // Raw amount: 5 * 10^12 base units (5,000,000,000,000)
    const rawAmount = 5_000_000_000_000n;

    // With 6 decimals (e.g. USDC): 5,000,000 tokens >= 1,000,000 threshold => HIGH_VALUE_APPROVAL
    const res6 = classifyApproval(rawAmount, 6);
    expect(res6.classification).toBe('HIGH_VALUE_APPROVAL');
    expect(res6.isHighValue).toBe(true);
    expect(res6.normalizedAmount).toBe('5000000');

    // With 18 decimals (e.g. WETH): 0.000005 tokens < 1,000,000 threshold => STANDARD
    const res18 = classifyApproval(rawAmount, 18);
    expect(res18.classification).toBe('STANDARD');
    expect(res18.isHighValue).toBe(false);
    expect(res18.normalizedAmount).toBe('0.000005');

    // Classification diverges based on normalized amount despite identical raw amount
    expect(res6.classification).not.toBe(res18.classification);
  });

  it('H5-5: Decimals unavailable => deterministic degraded behavior without false normalization', () => {
    // An unverified token not in trusted fixtures
    const approveCalldata = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ROUTER, 5000000000000n],
    });

    const decoded = decodeTransactionCalldata(UNKNOWN_TOKEN, approveCalldata);
    expect(decoded.detectedApprovals.length).toBe(1);
    const app = decoded.detectedApprovals[0];

    expect(app.decimalsAvailable).toBe(false);
    expect(app.decimals).toBeNull();
    expect(app.normalizedAmount).toBeNull(); // Strictly NO false normalization!
    expect(app.degradedReason).toMatch(/Token decimals unavailable/i);
    expect(app.classification).toBe('STANDARD'); // Below fallback raw threshold

    // When raw amount exceeds conservative fallback threshold (10^30)
    const hugeCalldata = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ROUTER, 10n ** 30n],
    });
    const decodedHuge = decodeTransactionCalldata(UNKNOWN_TOKEN, hugeCalldata);
    const appHuge = decodedHuge.detectedApprovals[0];

    expect(appHuge.decimalsAvailable).toBe(false);
    expect(appHuge.normalizedAmount).toBeNull();
    expect(appHuge.classification).toBe('HIGH_VALUE_APPROVAL'); // Conservative fail-closed!
    expect(appHuge.isHighValue).toBe(true);
  });

  it('H5-6: Decimals are strictly NOT inferred from token symbol, name, or application UI claim', () => {
    // App claims "Approve 100 USDC (6 decimals)" but contract address is unknown/unverified
    const approveCalldata = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ROUTER, 100000000n],
    });

    // Untrusted contract address with deceitful UI claim mentioning USDC and 6 decimals
    const decoded = decodeTransactionCalldata(UNKNOWN_TOKEN, approveCalldata);
    expect(decoded.detectedApprovals[0].decimalsAvailable).toBe(false);
    expect(decoded.detectedApprovals[0].decimals).toBeNull();
    expect(decoded.detectedApprovals[0].normalizedAmount).toBeNull();

    // Verifying trusted registry lookup directly
    expect(getTrustedTokenDecimals(UNKNOWN_TOKEN)).toBeUndefined();
    expect(getTrustedTokenDecimals(USDC)).toBe(6);
    expect(getTrustedTokenDecimals(WETH)).toBe(18);
  });

  it('H5-7: Existing H2 spender binding remains strictly enforced on approvals', () => {
    // Standard approval for 100 USDC with 6 decimals (100_000_000 base units)
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Approve 100 USDC';
    evidence.application.structuredIntent = {
      category: 'APPROVE',
      expectedSpender: ROUTER,
      rawDescription: 'Approve 100 USDC',
    };
    evidence.decode.functionName = 'approve';
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: USDC, functionName: 'approve', signature: 'approve(...)',
      args: { spender: ATTACKER, amount: '100000000' }, isDangerous: false,
    }];

    // Expected ROUTER, but approved ATTACKER => Spender mismatch BLOCKED
    const res = getRule09().evaluate(evidence, {});
    expect(res.passed).toBe(false);
    expect(res.verdictContribution).toBe('BLOCKED');
    expect(res.reason).toMatch(/Spender mismatch/i);

    // Unbound spender in intent => UNBOUND_APPROVAL_SPENDER BLOCKED
    evidence.application.structuredIntent = {
      category: 'APPROVE',
      expectedSpender: undefined,
      rawDescription: 'Approve 100 USDC',
    };
    const resUnbound = getRule09().evaluate(evidence, {});
    expect(resUnbound.passed).toBe(false);
    expect(resUnbound.verdictContribution).toBe('BLOCKED');
    expect(resUnbound.reason).toMatch(/UNBOUND_APPROVAL_SPENDER/i);
  });

  it('H5-8: Existing unlimited and high-value approval behavior does not regress', () => {
    // Unlimited approval
    const unlimitedEvidence = createMockEvidence();
    unlimitedEvidence.decode.hasExactUnlimitedApproval = true;
    unlimitedEvidence.decode.detectedApprovals = [{
      token: USDC,
      spender: ROUTER,
      amount: UINT256_MAX.toString(),
      classification: 'EXACT_UNLIMITED',
      isExactUnlimited: true,
      isHighValue: false,
      decimals: 6,
      decimalsAvailable: true,
    }];
    const engine = new DeterministicPolicyEngine();
    const verdictUnlimited = engine.evaluate(unlimitedEvidence);
    expect(verdictUnlimited.verdict).toBe('BLOCKED');
    expect(verdictUnlimited.primaryReason).toMatch(/exact unlimited/i);

    // High value approval
    const highValueEvidence = createMockEvidence();
    highValueEvidence.decode.hasHighValueApproval = true;
    highValueEvidence.decode.detectedApprovals = [{
      token: USDC,
      spender: ROUTER,
      amount: (10n ** 30n).toString(),
      classification: 'HIGH_VALUE_APPROVAL',
      isExactUnlimited: false,
      isHighValue: true,
      decimals: 6,
      normalizedAmount: '1000000000000000000000000',
      decimalsAvailable: true,
    }];
    const verdictHighValue = engine.evaluate(highValueEvidence);
    expect(verdictHighValue.verdict).toBe('BLOCKED');
    expect(verdictHighValue.primaryReason).toMatch(/high-value/i);

    // Standard retail approval passes without triggering Rule 02A or 02B
    const standardEvidence = createMockEvidence();
    standardEvidence.decode.hasExactUnlimitedApproval = false;
    standardEvidence.decode.hasHighValueApproval = false;
    standardEvidence.decode.detectedApprovals = [{
      token: USDC,
      spender: ROUTER,
      amount: '100000000',
      classification: 'STANDARD',
      isExactUnlimited: false,
      isHighValue: false,
      decimals: 6,
      normalizedAmount: '100',
      decimalsAvailable: true,
    }];
    expect(getRule02A().evaluate(standardEvidence, {}).passed).toBe(true);
    expect(getRule02B().evaluate(standardEvidence, {}).passed).toBe(true);
  });

  it('H5-9: Nested multicall approval unpacks and applies decimal normalization identically', () => {
    // High-value approval on USDC tucked inside multicall (aggregate3 with explicit target: USDC)
    const approveCalldata = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ATTACKER, 10n ** 29n],
    });

    const multicallCalldata = encodeFunctionData({
      abi: parseAbi([
        'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) returns ((bool success, bytes returnData)[])',
      ]),
      functionName: 'aggregate3',
      args: [[{ target: USDC, allowFailure: false, callData: approveCalldata }]],
    });

    const decoded = decodeTransactionCalldata(ROUTER, multicallCalldata);
    expect(decoded.status).toBe('MULTICALL_DECODED');
    expect(decoded.hasHighValueApproval).toBe(true);
    expect(decoded.detectedApprovals[0].token.toLowerCase()).toBe(USDC.toLowerCase());
    expect(decoded.detectedApprovals[0].decimals).toBe(6);
    expect(decoded.detectedApprovals[0].normalizedAmount).toBe('100000000000000000000000');
    expect(decoded.detectedApprovals[0].classification).toBe('HIGH_VALUE_APPROVAL');
  });

  it('H5-10: Normal swap continues to evaluate to VERIFIED with clean policy execution', () => {
    const evidence = createMockEvidence();
    evidence.application.declaredAction = 'Swap 100 USDC -> ETH';
    evidence.application.structuredIntent = {
      category: 'SWAP',
      expectedRecipient: ALICE,
      rawDescription: 'Swap 100 USDC -> ETH',
    };
    evidence.transaction.canonical = { ...evidence.transaction.canonical, from: ALICE };
    evidence.decode.functionName = 'exactInputSingle';
    evidence.decode.args = { amountIn: '100000000', recipient: ALICE };
    evidence.decode.callTree = [{
      index: 0, depth: 0, target: ROUTER, functionName: 'exactInputSingle', signature: 'exactInputSingle(...)',
      args: { recipient: ALICE }, isDangerous: false,
    }];
    evidence.decode.detectedApprovals = [];
    evidence.decode.hasExactUnlimitedApproval = false;
    evidence.decode.hasHighValueApproval = false;

    const engine = new DeterministicPolicyEngine();
    const verdict = engine.evaluate(evidence);
    expect(verdict.verdict).toBe('VERIFIED');
    expect(verdict.blockedReasons.length).toBe(0);
    expect(verdict.warnings.length).toBe(0);
  });

  it('H5-11: normalizeTokenAmount deterministic precision and boundary invariants', () => {
    expect(normalizeTokenAmount(1_500_000n, 6).formattedString).toBe('1.5');
    expect(normalizeTokenAmount(1_000_001n, 6).formattedString).toBe('1.000001');
    expect(normalizeTokenAmount(100n, 6).formattedString).toBe('0.0001');
    expect(normalizeTokenAmount(0n, 6).formattedString).toBe('0');
    expect(normalizeTokenAmount(1000n, 0).formattedString).toBe('1000');
    expect(normalizeTokenAmount(10n ** 18n, 18).formattedString).toBe('1');
    expect(() => normalizeTokenAmount(100n, -1)).toThrow(/Invalid token decimals/);
    expect(() => normalizeTokenAmount(100n, 256)).toThrow(/Invalid token decimals/);
  });
});

import { describe, it, expect } from 'vitest';
import {
  SourcifyContractAdapter,
  MANDATORY_CONTRACT_DISCLAIMER,
} from '../../src/analysis/contract.js';
import {
  UnavailableSimulationAdapter,
  LocalFixtureSimulationAdapter,
  MANDATORY_SIMULATION_DISCLAIMER,
} from '../../src/analysis/simulation.js';
import { ERC7730v2Adapter } from '../../src/intent/erc7730.js';
import type { DecodeEvidence } from '../../src/evidence/types.js';

const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
const UNKNOWN_CONTRACT = '0x1111111111111111111111111111111111111111' as const;

describe('Evidence Honesty & Provenance Tests', () => {
  it('Sourcify Provenance: distinguishes LOCAL_FIXTURE from LIVE_EXTERNAL or UNAVAILABLE', async () => {
    // 1. Local fixture enabled
    const fixtureAdapter = new SourcifyContractAdapter('https://sourcify.dev/server', true);
    const fixtureResult = await fixtureAdapter.getContractEvidence(ROUTER, 1);

    expect(fixtureResult.status).toBe('VERIFIED_CORRESPONDENCE');
    expect(fixtureResult.provenance).toBe('LOCAL_FIXTURE');
    expect(fixtureResult.sourceDescription).toBe('verified source/bytecode correspondence fixture');
    expect(fixtureResult.disclaimer).toBe(MANDATORY_CONTRACT_DISCLAIMER);

    // 2. Local fixture disabled (force live lookup or unverified fallback)
    const liveAdapter = new SourcifyContractAdapter('https://sourcify.dev/server', false);
    const unverifiedResult = await liveAdapter.getContractEvidence(UNKNOWN_CONTRACT, 1);

    // Either unverified or service unavailable, but never falsely claiming local fixture
    expect(unverifiedResult.provenance).not.toBe('LOCAL_FIXTURE');
    expect(unverifiedResult.disclaimer).toBe(MANDATORY_CONTRACT_DISCLAIMER);
  });

  it('Simulation Honesty: UnavailableSimulationAdapter returns UNAVAILABLE without fabricating results', async () => {
    const adapter = new UnavailableSimulationAdapter('No real EVM engine connected');
    const result = await adapter.simulate({
      domain: 'actionproof.request.v1',
      type: '0x2',
      from: '0x04f8996da763b7a969b1028ee3007569eaf3a635',
      to: ROUTER,
      value: '0x0',
      data: '0x',
      chainId: 1,
      nonce: null,
      gas: null,
      gasPrice: null,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      accessList: [],
    });

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.provenance).toBe('NONE');
    expect(result.success).toBe(false);
    expect(result.blockNumber).toBeNull();
    expect(result.stateContext).toBeNull();
    expect(result.assetChanges).toEqual([]);
    expect(result.revertReason).toContain('No real EVM engine connected');
    expect(result.disclaimer).toBe(MANDATORY_SIMULATION_DISCLAIMER);
  });

  it('Simulation Honesty: LocalFixtureSimulationAdapter explicitly labels output as LOCAL_FIXTURE', async () => {
    const adapter = new LocalFixtureSimulationAdapter();
    const result = await adapter.simulate({
      domain: 'actionproof.request.v1',
      type: '0x2',
      from: '0x04f8996da763b7a969b1028ee3007569eaf3a635',
      to: ROUTER,
      value: '0x0',
      data: '0x',
      chainId: 1,
      nonce: null,
      gas: null,
      gasPrice: null,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      accessList: [],
    });

    expect(result.status).toBe('FIXTURE_SIMULATION');
    expect(result.provenance).toBe('LOCAL_FIXTURE');
    expect(result.disclaimer).toBe(MANDATORY_SIMULATION_DISCLAIMER);
  });

  it('ERC-7730 Cross-Validation: verifies match when all expected descriptor parameters exist in decoded calldata', async () => {
    const adapter = new ERC7730v2Adapter(true);
    const mockDecode: DecodeEvidence = {
      status: 'DECODED',
      functionName: 'exactInputSingle',
      signature: 'exactInputSingle(...)',
      args: {
        tokenIn: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        tokenOut: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        amountIn: '100000000',
        amountOutMinimum: '50000000000000000',
        recipient: '0x04f8996da763b7a969b1028ee3007569eaf3a635',
      },
      callTree: [],
      detectedApprovals: [],
      hasExactUnlimitedApproval: false,
      hasHighValueApproval: false,
    };

    const intent = await adapter.resolveIntent(ROUTER, 1, '0x04e45aaf', mockDecode);
    expect(intent.status).toBe('DESCRIPTOR_FOUND');
    expect(intent.provenance).toBe('LOCAL_FIXTURE');
    expect(intent.crossValidation.performed).toBe(true);
    expect(intent.crossValidation.matches).toBe(true);
    expect(intent.intentDisplay).toContain('Swap 100000000');
  });

  it('ERC-7730 Cross-Validation: detects DESCRIPTOR_MISMATCH when decoded calldata is missing expected parameters', async () => {
    const adapter = new ERC7730v2Adapter(true);
    // Incomplete or mismatched args
    const mockDecode: DecodeEvidence = {
      status: 'DECODED',
      functionName: 'exactInputSingle',
      signature: 'exactInputSingle(...)',
      args: {
        tokenIn: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        // Missing tokenOut, amountIn, amountOutMinimum, recipient
      },
      callTree: [],
      detectedApprovals: [],
      hasExactUnlimitedApproval: false,
      hasHighValueApproval: false,
    };

    const intent = await adapter.resolveIntent(ROUTER, 1, '0x04e45aaf', mockDecode);
    expect(intent.status).toBe('DESCRIPTOR_MISMATCH');
    expect(intent.crossValidation.matches).toBe(false);
    expect(intent.crossValidation.discrepancies.length).toBeGreaterThan(0);
  });
});

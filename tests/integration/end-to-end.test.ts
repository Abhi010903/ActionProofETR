import { describe, it, expect } from 'vitest';
import { encodeFunctionData } from 'viem';
import {
  ActionProofProviderProxy,
  MockWalletProvider,
  ActionProofResult,
} from '../../src/provider/index.js';
import {
  KNOWN_SWAP_ABI,
  KNOWN_ERC20_ABI,
  UINT256_MAX,
} from '../../src/analysis/decoder.js';
import { MULTICALL_ABIS } from '../../src/analysis/multicall.js';
import { EvidencePipeline } from '../../src/evidence/pipeline.js';
import { LocalFixtureSimulationAdapter } from '../../src/analysis/simulation.js';

const USER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as const;
const ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485' as const;

describe('End-to-End Integration Tests', () => {
  it('E2E Normal: Swap 100 USDC -> ETH succeeds end-to-end with VERIFIED status and forwards', async () => {
    const wallet = new MockWalletProvider();
    const pipeline = new EvidencePipeline({
      simulationAdapter: new LocalFixtureSimulationAdapter(),
    });
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Swap 100 USDC -> ETH',
      evidencePipeline: pipeline,
    });

    const swapData = encodeFunctionData({
      abi: KNOWN_SWAP_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: USDC,
        tokenOut: WETH,
        fee: 3000,
        recipient: USER,
        deadline: 1893456000n,
        amountIn: 100000000n,
        amountOutMinimum: 50000000000000000n,
        sqrtPriceLimitX96: 0n,
      }],
    });

    const request = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: swapData,
      chainId: 1,
      type: '0x2',
      maxFeePerGas: '0x3b9aca00',
      maxPriorityFeePerGas: '0x3b9aca00',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [request],
    })) as ActionProofResult;

    expect(result.verdict).toBe('VERIFIED');
    expect(result.blockedBeforeForwarding).toBe(false);
    expect(result.txHash).toBeTruthy();
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.binding.status).toBe('MATCH');
    expect(result.evidence!.contract.status).toBe('VERIFIED_CORRESPONDENCE');
    expect(result.evidence!.contract.provenance).toBe('LOCAL_FIXTURE');
    expect(result.evidence!.intent.status).toBe('DESCRIPTOR_FOUND');
    expect(result.evidence!.intent.crossValidation.matches).toBe(true);
    expect(result.evidence!.simulation.status).toBe('FIXTURE_SIMULATION');
    expect(wallet.received.length).toBe(1);
  });

  it('E2E Attack: Multicall with hidden exact unlimited approval is BLOCKED and wallet receives nothing', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Swap 100 USDC -> ETH',
    });

    const swapData = encodeFunctionData({
      abi: KNOWN_SWAP_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: USDC,
        tokenOut: WETH,
        fee: 3000,
        recipient: USER,
        deadline: 1893456000n,
        amountIn: 100000000n,
        amountOutMinimum: 50000000000000000n,
        sqrtPriceLimitX96: 0n,
      }],
    });

    const approveData = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ATTACKER, UINT256_MAX],
    });

    const multicallData = encodeFunctionData({
      abi: MULTICALL_ABIS,
      functionName: 'multicall',
      args: [[swapData, approveData]],
    });

    const request = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: multicallData,
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [request],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(result.txHash).toBeNull();
    expect(wallet.received.length).toBe(0);
  });

  it('E2E Mutation: Router address mutated before forwarding is BLOCKED and wallet receives nothing', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Swap 100 USDC -> ETH',
      barrier: async (tx) => {
        tx.to = ATTACKER;
      },
    });

    const swapData = encodeFunctionData({
      abi: KNOWN_SWAP_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: USDC,
        tokenOut: WETH,
        fee: 3000,
        recipient: USER,
        deadline: 1893456000n,
        amountIn: 100000000n,
        amountOutMinimum: 50000000000000000n,
        sqrtPriceLimitX96: 0n,
      }],
    });

    const liveTx = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: swapData,
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('E2E Demo Scenario 4: Unknown calldata is BLOCKED (fail-closed) and wallet receives nothing', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Execute custom contract interaction',
    });

    const unknownTx = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: '0x1234567800000000000000000000000000000000000000000000000000000000deadbeef',
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [unknownTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.evidence?.decode.status).toBe('UNKNOWN_CALLDATA');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(result.txHash).toBeNull();
    expect(wallet.received.length).toBe(0);
  });

  it('E2E Demo Scenario 5: Unsupported EIP-7702 authorizationList fails closed with UNSUPPORTED', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Authorize batch execution',
    });

    const eip7702Tx = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: '0x',
      chainId: 1,
      type: '0x2',
      authorizationList: [{
        chainId: '0x1',
        address: ATTACKER,
        nonce: '0x0',
        yParity: '0x0',
        r: '0x0',
        s: '0x0',
      }],
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [eip7702Tx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('UNSUPPORTED');
    expect(result.reason).toBe('UNSUPPORTED_FIELD:authorizationList');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(result.txHash).toBeNull();
    expect(wallet.received.length).toBe(0);
  });
});


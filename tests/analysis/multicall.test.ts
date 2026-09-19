import { describe, it, expect } from 'vitest';
import { encodeFunctionData } from 'viem';
import {
  decodeTransactionCalldata,
  classifyApproval,
  KNOWN_ERC20_ABI,
  KNOWN_SWAP_ABI,
  UINT256_MAX,
} from '../../src/analysis/decoder.js';
import { MULTICALL_ABIS } from '../../src/analysis/multicall.js';
import {
  ActionProofProviderProxy,
  MockWalletProvider,
  ActionProofResult,
} from '../../src/provider/index.js';

const USER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
const ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485' as const;
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as const;

describe('Transaction Decoder & Recursive Multicall Analysis', () => {
  it('approval classification: correctly distinguishes EXACT_UNLIMITED, HIGH_VALUE_APPROVAL, and STANDARD', () => {
    // 1. Exact unlimited (type(uint256).max)
    const exact = classifyApproval(UINT256_MAX);
    expect(exact.classification).toBe('EXACT_UNLIMITED');
    expect(exact.isExactUnlimited).toBe(true);
    expect(exact.isHighValue).toBe(false);

    // 2. High value approval (>= 10^30 but not max)
    const highVal = classifyApproval(10n ** 31n);
    expect(highVal.classification).toBe('HIGH_VALUE_APPROVAL');
    expect(highVal.isExactUnlimited).toBe(false);
    expect(highVal.isHighValue).toBe(true);

    // 3. Standard approval (e.g. 100 USDC = 100 * 10^6)
    const standard = classifyApproval(100000000n);
    expect(standard.classification).toBe('STANDARD');
    expect(standard.isExactUnlimited).toBe(false);
    expect(standard.isHighValue).toBe(false);
  });

  it('correctly decodes standard ERC-20 transfer', () => {
    const transferData = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'transfer',
      args: [ROUTER, 100000000n],
    });

    const evidence = decodeTransactionCalldata(USDC, transferData);
    expect(evidence.status).toBe('DECODED');
    expect(evidence.functionName).toBe('transfer');
    expect(evidence.args?.amount).toBe('100000000');
    expect(evidence.hasExactUnlimitedApproval).toBe(false);
    expect(evidence.hasHighValueApproval).toBe(false);
  });

  it('detects dangerous exact unlimited approval in standalone approve call', () => {
    const approveData = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ATTACKER, UINT256_MAX],
    });

    const evidence = decodeTransactionCalldata(USDC, approveData);
    expect(evidence.status).toBe('DECODED');
    expect(evidence.functionName).toBe('approve');
    expect(evidence.hasExactUnlimitedApproval).toBe(true);
    expect(evidence.hasHighValueApproval).toBe(false);
    expect(evidence.detectedApprovals[0].classification).toBe('EXACT_UNLIMITED');
    expect(evidence.callTree[0].isDangerous).toBe(true);
  });

  it('detects high-value-but-not-max approval in standalone approve call', () => {
    const approveData = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ATTACKER, 10n ** 32n],
    });

    const evidence = decodeTransactionCalldata(USDC, approveData);
    expect(evidence.status).toBe('DECODED');
    expect(evidence.functionName).toBe('approve');
    expect(evidence.hasExactUnlimitedApproval).toBe(false);
    expect(evidence.hasHighValueApproval).toBe(true);
    expect(evidence.detectedApprovals[0].classification).toBe('HIGH_VALUE_APPROVAL');
    expect(evidence.callTree[0].isDangerous).toBe(true);
  });

  it('recursively unpacks multicall with honest swap', () => {
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

    const multicallData = encodeFunctionData({
      abi: MULTICALL_ABIS,
      functionName: 'multicall',
      args: [[swapData]],
    });

    const evidence = decodeTransactionCalldata(ROUTER, multicallData);
    expect(evidence.status).toBe('MULTICALL_DECODED');
    expect(evidence.hasExactUnlimitedApproval).toBe(false);
    expect(evidence.hasHighValueApproval).toBe(false);
    expect(evidence.callTree[0].children?.length).toBe(1);
    expect(evidence.callTree[0].children?.[0].functionName).toBe('exactInputSingle');
  });

  it('HACKATHON ATTACK DEMO: Detects stealth approval hidden inside multicall and BLOCKS forwarding', async () => {
    // Legitimate swap subcall
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

    // Malicious stealth subcall: approve exact unlimited USDC to attacker!
    const maliciousApproveData = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ATTACKER, UINT256_MAX],
    });

    // Wrapped together in multicall(bytes[])
    const multicallData = encodeFunctionData({
      abi: MULTICALL_ABIS,
      functionName: 'multicall',
      args: [[swapData, maliciousApproveData]],
    });

    const wallet = new MockWalletProvider();
    // DApp UI deceptively displays "Swap 100 USDC -> ETH"
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Swap 100 USDC -> ETH',
    });

    const attackTx = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: multicallData,
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [attackTx],
    })) as ActionProofResult;

    // CRITICAL EXPECTATIONS:
    // 1. ActionProof verdict must be BLOCKED
    expect(result.verdict).toBe('BLOCKED');
    // 2. Reason must specify the hidden dangerous unlimited approval
    expect(result.reason).toMatch(/unlimited/i);
    // 3. Request must be blocked before forwarding
    expect(result.blockedBeforeForwarding).toBe(true);
    // 4. Mock wallet provider must receive NOTHING
    expect(wallet.received.length).toBe(0);

    // Verify detailed evidence structure
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.decode.hasExactUnlimitedApproval).toBe(true);
    expect(result.evidence!.decode.detectedApprovals.length).toBe(1);
    expect(result.evidence!.decode.detectedApprovals[0].spender).toBe(ATTACKER);
    expect(result.evidence!.decode.detectedApprovals[0].classification).toBe('EXACT_UNLIMITED');
    expect(result.evidence!.policy.blockedReasons.length).toBeGreaterThan(0);
  });

  it('Approval Classification Boundary Invariants: verifies exact boundaries', () => {
    // 1. Exact max: type(uint256).max
    const max = classifyApproval(UINT256_MAX);
    expect(max.classification).toBe('EXACT_UNLIMITED');
    expect(max.isExactUnlimited).toBe(true);
    expect(max.isHighValue).toBe(false);

    // 2. Exact max - 1: Must NOT be EXACT_UNLIMITED, but IS HIGH_VALUE_APPROVAL
    const maxMinusOne = classifyApproval(UINT256_MAX - 1n);
    expect(maxMinusOne.classification).toBe('HIGH_VALUE_APPROVAL');
    expect(maxMinusOne.isExactUnlimited).toBe(false);
    expect(maxMinusOne.isHighValue).toBe(true);

    // 3. Exactly 10^30 (threshold boundary): IS HIGH_VALUE_APPROVAL
    const exactlyThreshold = classifyApproval(10n ** 30n);
    expect(exactlyThreshold.classification).toBe('HIGH_VALUE_APPROVAL');
    expect(exactlyThreshold.isExactUnlimited).toBe(false);
    expect(exactlyThreshold.isHighValue).toBe(true);

    // 4. Exactly 10^30 - 1: IS STANDARD
    const belowThreshold = classifyApproval(10n ** 30n - 1n);
    expect(belowThreshold.classification).toBe('STANDARD');
    expect(belowThreshold.isExactUnlimited).toBe(false);
    expect(belowThreshold.isHighValue).toBe(false);

    // 5. Zero: IS STANDARD
    const zero = classifyApproval(0n);
    expect(zero.classification).toBe('STANDARD');
    expect(zero.isExactUnlimited).toBe(false);
    expect(zero.isHighValue).toBe(false);
  });

  it('Deeply Nested Multicall: Unpacks multicall nested 3 levels deep and BLOCKS stealth approval', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Swap tokens',
    });

    // Level 3: approve(attacker, MAX_UINT256)
    const level3Approve = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'approve',
      args: [ATTACKER, UINT256_MAX],
    });

    // Level 2: multicall([approve])
    const level2Multicall = encodeFunctionData({
      abi: MULTICALL_ABIS,
      functionName: 'multicall',
      args: [[level3Approve]],
    });

    // Level 1: multicall([multicall([approve])])
    const level1Multicall = encodeFunctionData({
      abi: MULTICALL_ABIS,
      functionName: 'multicall',
      args: [[level2Multicall]],
    });

    const attackTx = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: level1Multicall,
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [attackTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toMatch(/unlimited/i);
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
    expect(result.evidence?.decode.hasExactUnlimitedApproval).toBe(true);
  });

  it('Unrecognized Subcall in Multicall: Fails closed when multicall contains un-decodable subcall', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Batch operations',
    });

    // Subcall 1: Legitimate transfer
    const transferCall = encodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      functionName: 'transfer',
      args: [ROUTER, 100000000n],
    });

    // Subcall 2: Arbitrary unrecognized selector (e.g. unknown custom exploit call)
    const unrecognizedCall = '0x12345678000000000000000000000000e64ba38a4b958c72bc0d421150ba464636422485' as `0x${string}`;

    const batchData = encodeFunctionData({
      abi: MULTICALL_ABIS,
      functionName: 'multicall',
      args: [[transferCall, unrecognizedCall]],
    });

    const tx = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: batchData,
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [tx],
    })) as ActionProofResult;

    // Must FAIL CLOSED because an un-decodable subcall cannot be safely understood
    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toMatch(/unrecognized or un-decodable/i);
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });
});

/**
 * ActionProof Demo Lab Scenarios
 *
 * WHAT it guarantees:
 * - Deterministic, pre-configured test fixtures for standard and adversarial workflows:
 *   1. Normal Supported Swap (Uniswap v3)
 *   2. Attack: Hidden Unlimited Approval in Multicall
 *   3. Mutation: Post-Verification Destination Tampering (Level-2 Binding Barrier)
 *   4. Unverifiable: Unknown Calldata (Fail-Closed Policy)
 *   5. Unsupported: EIP-7702 Authorization List (Boundary Enforcement)
 *   6. Mutation: Calldata Mutated Post-Verification
 *   7. Mutation: Native Value Altered (0 ETH -> 10 ETH)
 *   8. Unsupported: EIP-5792 wallet_sendCalls
 *   9. Boundary Notice: Direct Provider Bypass
 */

import { encodeFunctionData } from 'viem';
import { KNOWN_SWAP_ABI, KNOWN_ERC20_ABI, UINT256_MAX } from '../analysis/decoder.js';
import { MULTICALL_ABIS } from '../analysis/multicall.js';

export const DEMO_USER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
export const DEMO_ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
export const DEMO_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
export const DEMO_WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as const;
export const DEMO_ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485' as const;

export interface DemoScenario {
  id: string;
  name: string;
  category: 'NORMAL' | 'ATTACK' | 'MUTATION' | 'UNVERIFIABLE' | 'UNSUPPORTED' | 'BOUNDARY';
  shortDescription: string;
  declaredAction: string;
  method: string;
  getRequest: () => Record<string, unknown>;
  mutationHook?: (tx: Record<string, unknown>) => void;
  explanation: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'normal_swap',
    name: '1. Normal Supported Swap (Uniswap v3)',
    category: 'NORMAL',
    shortDescription: 'Legitimate Swap 100 USDC -> ETH via SwapRouter02',
    declaredAction: 'Swap 100 USDC -> ETH',
    method: 'eth_sendTransaction',
    getRequest: () => {
      const swapData = encodeFunctionData({
        abi: KNOWN_SWAP_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: DEMO_USDC,
          tokenOut: DEMO_WETH,
          fee: 3000,
          recipient: DEMO_USER,
          deadline: 1893456000n,
          amountIn: 100000000n, // 100 USDC (6 decimals)
          amountOutMinimum: 50000000000000000n,
          sqrtPriceLimitX96: 0n,
        }],
      });
      return {
        from: DEMO_USER,
        to: DEMO_ROUTER,
        value: '0x0',
        data: swapData,
        chainId: 1,
        type: '0x2',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
      };
    },
    explanation: 'Captures request, takes immutable snapshot, canonicalizes under actionproof.request.v1, computes Commitment A, independently decodes swapExactInputSingle, cross-references Sourcify correspondence & ERC-7730 descriptor, evaluates simulation evidence (deterministic LOCAL_FIXTURE fixture — not live EVM execution), evaluates 8 deterministic policy rules, verifies Commitment B recheck matches Commitment A, and forwards verified snapshot to wallet. Status: VERIFIED — mandatory supported checks passed and Level-2 provider binding established.',
  },

  {
    id: 'attack_multicall_stealth_approval',
    name: '2. Attack: Hidden Unlimited Approval in Multicall',
    category: 'ATTACK',
    shortDescription: 'DApp UI claims "Swap 100 USDC -> ETH", but batch contains approve(attacker, uint256.max)',
    declaredAction: 'Swap 100 USDC -> ETH',
    method: 'eth_sendTransaction',
    getRequest: () => {
      const swapData = encodeFunctionData({
        abi: KNOWN_SWAP_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: DEMO_USDC,
          tokenOut: DEMO_WETH,
          fee: 3000,
          recipient: DEMO_USER,
          deadline: 1893456000n,
          amountIn: 100000000n,
          amountOutMinimum: 50000000000000000n,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const maliciousApproveData = encodeFunctionData({
        abi: KNOWN_ERC20_ABI,
        functionName: 'approve',
        args: [DEMO_ATTACKER, UINT256_MAX],
      });
      const multicallData = encodeFunctionData({
        abi: MULTICALL_ABIS,
        functionName: 'multicall',
        args: [[swapData, maliciousApproveData]],
      });
      return {
        from: DEMO_USER,
        to: DEMO_ROUTER,
        value: '0x0',
        data: multicallData,
        chainId: 1,
        type: '0x2',
      };
    },
    explanation: 'Untrusted DApp UI asserts a harmless swap claim. ActionProof recursively unpacks the multicall batch and isolates subcall #2: approve(attacker, type(uint256).max). Deterministic policy triggers fatal violations (RULE_01_NO_UNLIMITED_APPROVAL and RULE_04_NO_STEALTH_APPROVAL). Request is BLOCKED before wallet forwarding. The wallet receives ZERO requests.',
  },
  {
    id: 'attack_destination_mutation',
    name: '3. Mutation: Post-Verification Destination Tampering',
    category: 'MUTATION',
    shortDescription: 'Hostile script mutates target address (Router -> Attacker) post-verification',
    declaredAction: 'Swap 100 USDC -> ETH',
    method: 'eth_sendTransaction',
    getRequest: () => {
      const swapData = encodeFunctionData({
        abi: KNOWN_SWAP_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: DEMO_USDC,
          tokenOut: DEMO_WETH,
          fee: 3000,
          recipient: DEMO_USER,
          deadline: 1893456000n,
          amountIn: 100000000n,
          amountOutMinimum: 50000000000000000n,
          sqrtPriceLimitX96: 0n,
        }],
      });
      return {
        from: DEMO_USER,
        to: DEMO_ROUTER,
        value: '0x0',
        data: swapData,
        chainId: 1,
        type: '0x2',
      };
    },
    mutationHook: (tx) => {
      tx.to = DEMO_ATTACKER;
    },
    explanation: 'Demonstrates Level-2 Provider Binding in action. Original swap request passes initial verification. A hostile client script mutates tx.to to the attacker address immediately prior to forwarding. The pre-forward commitment recheck recomputes the canonical hash on the forward snapshot and detects the mismatch. Forwarding is aborted. Result: BLOCKED, wallet receives ZERO requests.',
  },
  {
    id: 'unknown_calldata',
    name: '4. Unverifiable: Unknown Calldata (Fail-Closed)',
    category: 'UNVERIFIABLE',
    shortDescription: 'Unrecognized selector 0x12345678 cannot be independently decoded',
    declaredAction: 'Execute custom contract interaction',
    method: 'eth_sendTransaction',
    getRequest: () => ({
      from: DEMO_USER,
      to: DEMO_ROUTER,
      value: '0x0',
      data: '0x1234567800000000000000000000000000000000000000000000000000000000deadbeef',
      chainId: 1,
      type: '0x2',
    }),
    explanation: 'Independent decoding fails with UNKNOWN_CALLDATA. ActionProof applies a strict fail-closed defense policy (RULE_08_CALLDATA_DECODING_STATUS): ActionProof cannot verify what it cannot decode. "No known malicious behavior detected" is NOT the same as "verified safe". Status: UNVERIFIABLE / BLOCKED. Forwarding is PREVENTED; wallet receives ZERO requests.',
  },
  {
    id: 'unsupported_eip7702',
    name: '5. Unsupported: EIP-7702 Authorization List',
    category: 'UNSUPPORTED',
    shortDescription: 'EOA code delegation via authorizationList is outside MVP boundary',
    declaredAction: 'Authorize batch execution',
    method: 'eth_sendTransaction',
    getRequest: () => ({
      from: DEMO_USER,
      to: DEMO_ROUTER,
      value: '0x0',
      data: '0x',
      chainId: 1,
      type: '0x2',
      authorizationList: [{
        chainId: '0x1',
        address: DEMO_ATTACKER,
        nonce: '0x0',
        yParity: '0x0',
        r: '0x0',
        s: '0x0',
      }],
    }),
    explanation: 'EIP-7702 introduces type-4 authorization lists capable of mutating EOA execution logic. It is outside the frozen MVP scope. Canonical schema validation rejects the unsupported field (UNSUPPORTED_FIELD_AUTHORIZATION_LIST). ActionProof fails closed with UNSUPPORTED and blocks forwarding before the wallet is touched. Not labeled malicious; explicitly marked unsupported.',
  },
  {
    id: 'attack_calldata_mutation',
    name: '6. Mutation: Calldata Mutated Post-Verification',
    category: 'MUTATION',
    shortDescription: 'Calldata swapped to malicious drainer after verification passes',
    declaredAction: 'Swap 100 USDC -> ETH',
    method: 'eth_sendTransaction',
    getRequest: () => {
      const swapData = encodeFunctionData({
        abi: KNOWN_SWAP_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: DEMO_USDC,
          tokenOut: DEMO_WETH,
          fee: 3000,
          recipient: DEMO_USER,
          deadline: 1893456000n,
          amountIn: 100000000n,
          amountOutMinimum: 50000000000000000n,
          sqrtPriceLimitX96: 0n,
        }],
      });
      return {
        from: DEMO_USER,
        to: DEMO_ROUTER,
        value: '0x0',
        data: swapData,
        chainId: 1,
        type: '0x2',
      };
    },
    mutationHook: (tx) => {
      tx.data = encodeFunctionData({
        abi: KNOWN_ERC20_ABI,
        functionName: 'approve',
        args: [DEMO_ATTACKER, UINT256_MAX],
      });
    },
    explanation: 'Verified as Swap, but live payload mutated to approve() in memory before wallet dispatch. Pre-forward recheck detects commitment hash divergence. Result: BLOCKED, wallet receives ZERO requests.',
  },
  {
    id: 'attack_value_mutation',
    name: '7. Mutation: Native Value Altered (0 ETH -> 10 ETH)',
    category: 'MUTATION',
    shortDescription: 'Native transaction value injected after verification passes',
    declaredAction: 'Swap 100 USDC -> ETH',
    method: 'eth_sendTransaction',
    getRequest: () => {
      const swapData = encodeFunctionData({
        abi: KNOWN_SWAP_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: DEMO_USDC,
          tokenOut: DEMO_WETH,
          fee: 3000,
          recipient: DEMO_USER,
          deadline: 1893456000n,
          amountIn: 100000000n,
          amountOutMinimum: 50000000000000000n,
          sqrtPriceLimitX96: 0n,
        }],
      });
      return {
        from: DEMO_USER,
        to: DEMO_ROUTER,
        value: '0x0',
        data: swapData,
        chainId: 1,
        type: '0x2',
      };
    },
    mutationHook: (tx) => {
      tx.value = '0x8ac7230489e80000'; // 10 ETH
    },
    explanation: 'Verified with value 0 ETH, but injected with 10 ETH before forwarding. Pre-forward commitment recheck detects value mismatch. Result: BLOCKED, wallet receives ZERO requests.',
  },
  {
    id: 'unsupported_eip5792',
    name: '8. Unsupported: EIP-5792 wallet_sendCalls',
    category: 'UNSUPPORTED',
    shortDescription: 'Alternative wallet batch RPC method outside MVP boundary',
    declaredAction: 'Send batch calls',
    method: 'wallet_sendCalls',
    getRequest: () => ({
      version: '1.0',
      from: DEMO_USER,
      calls: [{ to: DEMO_ROUTER, data: '0x', value: '0x0' }],
    }),
    explanation: 'EIP-5792 wallet_sendCalls bypasses standard eth_sendTransaction RPC semantics. ActionProof explicitly marks alternative write paths as UNSUPPORTED and never forwards them.',
  },
  {
    id: 'boundary_bypass_demo',
    name: '9. Boundary Notice: Direct Provider Bypass',
    category: 'BOUNDARY',
    shortDescription: 'Explains the architectural boundary limitation if DApp bypasses proxy',
    declaredAction: 'Direct wallet call',
    method: 'eth_sendTransaction',
    getRequest: () => ({
      from: DEMO_USER,
      to: DEMO_ATTACKER,
      value: '0x0',
      data: '0x',
      chainId: 1,
      type: '0x2',
    }),
    explanation: 'ARCHITECTURAL BOUNDARY LIMITATION: ActionProof guarantees request binding strictly within its controlled EIP-1193 provider boundary. If an adversarial DApp accesses an alternate provider directly (e.g. window.ethereum before proxy injection) or an adversarial browser extension modifies the wallet transport, it bypasses this gate. This is an explicit boundary limitation of JavaScript client-side proxy wrappers.',
  },
];

/**
 * ActionProof Independent Transaction Decoder
 *
 * WHAT it guarantees:
 * - Decodes calldata independently using standard Ethereum ABIs without trusting client text claims.
 * - Identifies standard ERC-20 calls (transfer, approve, transferFrom) and Uniswap swap calls.
 * - Distinguishes between EXACT_UNLIMITED (amount === uint256.max) and HIGH_VALUE_APPROVAL (amount >= threshold).
 * - Surfaces dangerous stealth actions down the call tree.
 *
 * WHAT it does NOT guarantee:
 * - Does not cover proprietary or obfuscated smart contract ABIs outside known registry/interfaces.
 */

import { decodeFunctionData, parseAbi, type Hex } from 'viem';
import type {
  ApprovalDetail,
  ApprovalClassification,
  DecodeEvidence,
  CallTreeNode,
} from '../evidence/types.js';
import { decodeMulticallIfPresent } from './multicall.js';

export const KNOWN_ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
]);

export const KNOWN_SWAP_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
]);

export const UINT256_MAX = (1n << 256n) - 1n;
export const DEFAULT_HIGH_VALUE_THRESHOLD = 10n ** 30n;

export function classifyApproval(
  amount: bigint,
  highValueThreshold: bigint = DEFAULT_HIGH_VALUE_THRESHOLD
): {
  classification: ApprovalClassification;
  isExactUnlimited: boolean;
  isHighValue: boolean;
} {
  if (amount === UINT256_MAX) {
    return {
      classification: 'EXACT_UNLIMITED',
      isExactUnlimited: true,
      isHighValue: false,
    };
  }
  if (amount >= highValueThreshold) {
    return {
      classification: 'HIGH_VALUE_APPROVAL',
      isExactUnlimited: false,
      isHighValue: true,
    };
  }
  return {
    classification: 'STANDARD',
    isExactUnlimited: false,
    isHighValue: false,
  };
}

interface ExactInputSingleParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number;
  recipient: `0x${string}`;
  deadline: bigint;
  amountIn: bigint;
  amountOutMinimum: bigint;
  sqrtPriceLimitX96: bigint;
}

export function decodeTransactionCalldata(
  target: `0x${string}`,
  data: `0x${string}`
): DecodeEvidence {
  if (!data || data === '0x') {
    return {
      status: 'EMPTY_CALLDATA',
      functionName: null,
      signature: null,
      args: null,
      callTree: [],
      detectedApprovals: [],
      hasExactUnlimitedApproval: false,
      hasHighValueApproval: false,
    };
  }

  // 1. Check if this is a supported Multicall wrapper
  const multicallResult = decodeMulticallIfPresent(target, data);
  if (multicallResult) {
    return multicallResult;
  }

  // 2. Try decoding as ERC-20
  try {
    const decoded = decodeFunctionData({
      abi: KNOWN_ERC20_ABI,
      data: data as Hex,
    });

    const detectedApprovals: ApprovalDetail[] = [];
    let hasExactUnlimitedApproval = false;
    let hasHighValueApproval = false;
    let isDangerous = false;
    let dangerReason: string | undefined = undefined;

    const argsObj: Record<string, unknown> = {};

    if (decoded.functionName === 'approve') {
      const [spender, amount] = decoded.args as readonly [`0x${string}`, bigint];
      const classification = classifyApproval(amount);

      if (classification.isExactUnlimited) {
        hasExactUnlimitedApproval = true;
        isDangerous = true;
        dangerReason = `Exact unlimited token approval (type(uint256).max) requested for spender: ${spender}`;
      } else if (classification.isHighValue) {
        hasHighValueApproval = true;
        isDangerous = true;
        dangerReason = `High-value token approval (>= 10^30) requested for spender: ${spender}`;
      }

      detectedApprovals.push({
        token: target,
        spender: spender.toLowerCase() as `0x${string}`,
        amount: amount.toString(),
        classification: classification.classification,
        isExactUnlimited: classification.isExactUnlimited,
        isHighValue: classification.isHighValue,
      });

      argsObj.spender = spender;
      argsObj.amount = amount.toString();
    } else if (decoded.functionName === 'transfer') {
      const [to, amount] = decoded.args as readonly [`0x${string}`, bigint];
      argsObj.to = to;
      argsObj.amount = amount.toString();
    } else if (decoded.functionName === 'transferFrom') {
      const [from, to, amount] = decoded.args as readonly [`0x${string}`, `0x${string}`, bigint];
      argsObj.from = from;
      argsObj.to = to;
      argsObj.amount = amount.toString();
    }

    const node: CallTreeNode = {
      index: 0,
      depth: 0,
      target,
      functionName: decoded.functionName,
      signature: `${decoded.functionName}(...)`,
      args: argsObj,
      isDangerous,
      dangerReason,
    };

    return {
      status: 'DECODED',
      functionName: decoded.functionName,
      signature: `${decoded.functionName}(...)`,
      args: argsObj,
      callTree: [node],
      detectedApprovals,
      hasExactUnlimitedApproval,
      hasHighValueApproval,
    };
  } catch {
    // Continue to swap decoding
  }

  // 3. Try decoding as Swap
  try {
    const decoded = decodeFunctionData({
      abi: KNOWN_SWAP_ABI,
      data: data as Hex,
    });

    const argsObj: Record<string, unknown> = {};
    if (decoded.functionName === 'swapExactTokensForTokens') {
      const [amountIn, amountOutMin, path, to, deadline] = decoded.args as readonly [
        bigint,
        bigint,
        readonly `0x${string}`[],
        `0x${string}`,
        bigint
      ];
      argsObj.amountIn = amountIn.toString();
      argsObj.amountOutMin = amountOutMin.toString();
      argsObj.path = [...path];
      argsObj.to = to;
      argsObj.deadline = deadline.toString();
    } else if (decoded.functionName === 'exactInputSingle') {
      const params = (decoded.args as readonly [ExactInputSingleParams])[0];
      argsObj.tokenIn = params.tokenIn;
      argsObj.tokenOut = params.tokenOut;
      argsObj.amountIn = params.amountIn.toString();
      argsObj.amountOutMinimum = params.amountOutMinimum.toString();
      argsObj.recipient = params.recipient;
    }

    const node: CallTreeNode = {
      index: 0,
      depth: 0,
      target,
      functionName: decoded.functionName,
      signature: `${decoded.functionName}(...)`,
      args: argsObj,
      isDangerous: false,
    };

    return {
      status: 'DECODED',
      functionName: decoded.functionName,
      signature: `${decoded.functionName}(...)`,
      args: argsObj,
      callTree: [node],
      detectedApprovals: [],
      hasExactUnlimitedApproval: false,
      hasHighValueApproval: false,
    };
  } catch {
    // Unknown selector
  }

  // Fallback for unknown calldata
  const selector = data.slice(0, 10);
  return {
    status: 'UNKNOWN_CALLDATA',
    functionName: null,
    signature: selector,
    args: null,
    callTree: [{
      index: 0,
      depth: 0,
      target,
      functionName: `unknown_${selector}`,
      signature: selector,
      args: { rawData: data },
      isDangerous: false,
      dangerReason: 'Unrecognized function selector',
    }],
    detectedApprovals: [],
    hasExactUnlimitedApproval: false,
    hasHighValueApproval: false,
  };
}

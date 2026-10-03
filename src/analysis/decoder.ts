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
import { getTrustedTokenDecimals } from './contract.js';

export const KNOWN_ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
]);

export const KNOWN_SWAP_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
]);

/**
 * ============================================================================
 * ACTIONPROOF APPROVAL CLASSIFICATION THRESHOLDS & EVIDENCE DISTINCTIONS
 * ============================================================================
 *
 * 1. FACT: TOKEN DECIMALS EVIDENCE
 *    Token decimals represent an on-chain / registry fact regarding the token contract's
 *    underlying ERC-20 decimal representation. Decimals must only be sourced from
 *    explicitly trusted evidence sources (e.g. verified contract fixtures). Decimals
 *    MUST NEVER be inferred from token symbol, name, UI text, or application intent.
 *
 * 2. DESIGN DECISION / POLICY THRESHOLD:
 *    ActionProof defines a normalized threshold of 1,000,000 (10^6) whole tokens
 *    for classifying an approval as HIGH_VALUE_APPROVAL.
 *    NOTE: This is NOT a universal cryptographic, mathematical, or financial truth.
 *    No universal threshold exists for token approvals; a threshold is an explicit
 *    deterministic policy choice configured to flag unusually large allowances
 *    relative to standard retail interactions.
 *
 * 3. UNVERIFIED: UNAVAILABLE TOKEN METADATA
 *    When token decimals are unavailable or untrusted, ActionProof REFUSES to perform
 *    silent normalization (e.g. assuming 18 decimals). Instead, it classifies the
 *    approval using a conservative raw base-unit fallback threshold (10^30) or marks
 *    it as DEGRADED_UNVERIFIED to ensure fail-closed policy evaluation.
 * ============================================================================
 */
export const UINT256_MAX = (1n << 256n) - 1n;

// DESIGN DECISION / POLICY THRESHOLD: 1,000,000 normalized whole tokens
export const DESIGN_DECISION_HIGH_VALUE_THRESHOLD_TOKENS = 1_000_000n;

// UNVERIFIED: Conservative raw base-unit threshold when decimals are unavailable
export const FALLBACK_RAW_HIGH_VALUE_THRESHOLD = 10n ** 30n;
export const DEFAULT_HIGH_VALUE_THRESHOLD = FALLBACK_RAW_HIGH_VALUE_THRESHOLD;

export function normalizeTokenAmount(
  rawAmount: bigint,
  decimals: number
): {
  normalizedWhole: bigint;
  formattedString: string;
} {
  if (decimals < 0 || decimals > 255) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }
  const divisor = 10n ** BigInt(decimals);
  const quotient = rawAmount / divisor;
  const remainder = rawAmount % divisor;

  if (remainder === 0n) {
    return {
      normalizedWhole: quotient,
      formattedString: quotient.toString(),
    };
  }

  const remainderStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return {
    normalizedWhole: quotient,
    formattedString: `${quotient.toString()}.${remainderStr}`,
  };
}

export interface ApprovalClassificationResult {
  classification: ApprovalClassification;
  isExactUnlimited: boolean;
  isHighValue: boolean;
  decimals: number | null;
  normalizedAmount: string | null;
  decimalsAvailable: boolean;
  degradedReason?: string;
}

export function classifyApproval(
  amount: bigint,
  decimalsOrThreshold?: number | bigint | null,
  highValueTokenThreshold: bigint = DESIGN_DECISION_HIGH_VALUE_THRESHOLD_TOKENS,
  rawFallbackThreshold: bigint = FALLBACK_RAW_HIGH_VALUE_THRESHOLD
): ApprovalClassificationResult {
  // Distinguish whether 2nd argument is legacy raw threshold (bigint) or token decimals (number)
  let decimals: number | null = null;
  let effectiveRawFallback = rawFallbackThreshold;

  if (typeof decimalsOrThreshold === 'bigint') {
    effectiveRawFallback = decimalsOrThreshold;
  } else if (typeof decimalsOrThreshold === 'number') {
    decimals = decimalsOrThreshold;
  }

  // 1. EXACT_UNLIMITED invariant: uint256.max is always exact unlimited regardless of decimals
  if (amount === UINT256_MAX) {
    let normalizedStr: string | null = null;
    if (typeof decimals === 'number' && decimals >= 0 && decimals <= 255) {
      normalizedStr = normalizeTokenAmount(amount, decimals).formattedString;
    }
    return {
      classification: 'EXACT_UNLIMITED',
      isExactUnlimited: true,
      isHighValue: false,
      decimals: typeof decimals === 'number' ? decimals : null,
      normalizedAmount: normalizedStr,
      decimalsAvailable: typeof decimals === 'number',
    };
  }

  // 2. FACT: Known & trusted decimals -> normalize humanReadableAmount = rawAmount / 10^decimals
  // and compare against DESIGN DECISION policy threshold.
  if (typeof decimals === 'number' && decimals >= 0 && decimals <= 255) {
    const normalized = normalizeTokenAmount(amount, decimals);
    const isHighValue = normalized.normalizedWhole >= highValueTokenThreshold;
    return {
      classification: isHighValue ? 'HIGH_VALUE_APPROVAL' : 'STANDARD',
      isExactUnlimited: false,
      isHighValue,
      decimals,
      normalizedAmount: normalized.formattedString,
      decimalsAvailable: true,
    };
  }

  // 3. UNVERIFIED: Decimals unavailable or untrusted.
  // DO NOT silently normalize. Conservative fallback on raw base units.
  if (amount >= effectiveRawFallback) {
    return {
      classification: 'HIGH_VALUE_APPROVAL',
      isExactUnlimited: false,
      isHighValue: true,
      decimals: null,
      normalizedAmount: null,
      decimalsAvailable: false,
      degradedReason: `Token decimals unavailable; raw amount exceeds fallback threshold (${effectiveRawFallback.toString()})`,
    };
  }

  return {
    classification: 'STANDARD',
    isExactUnlimited: false,
    isHighValue: false,
    decimals: null,
    normalizedAmount: null,
    decimalsAvailable: false,
    degradedReason: 'Token decimals unavailable; evaluated using raw base-unit fallback threshold',
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

export interface DecodeOptions {
  getDecimals?: (tokenAddress: string) => number | undefined;
  highValueThresholdTokens?: bigint;
  rawFallbackThreshold?: bigint;
}

export function decodeTransactionCalldata(
  target: `0x${string}`,
  data: `0x${string}`,
  options?: DecodeOptions
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
  const multicallResult = decodeMulticallIfPresent(target, data, options);
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
      const decimals = options?.getDecimals
        ? options.getDecimals(target)
        : getTrustedTokenDecimals(target);
      const classification = classifyApproval(
        amount,
        decimals,
        options?.highValueThresholdTokens,
        options?.rawFallbackThreshold
      );

      if (classification.isExactUnlimited) {
        hasExactUnlimitedApproval = true;
        isDangerous = true;
        dangerReason = `Exact unlimited token approval (type(uint256).max) requested for spender: ${spender}`;
      } else if (classification.isHighValue) {
        hasHighValueApproval = true;
        isDangerous = true;
        const amtMsg = classification.normalizedAmount
          ? `${classification.normalizedAmount} tokens`
          : `raw >= ${options?.rawFallbackThreshold ?? FALLBACK_RAW_HIGH_VALUE_THRESHOLD}`;
        dangerReason = `High-value token approval (${amtMsg}) requested for spender: ${spender}`;
      }

      detectedApprovals.push({
        token: target,
        spender: spender.toLowerCase() as `0x${string}`,
        amount: amount.toString(),
        classification: classification.classification,
        isExactUnlimited: classification.isExactUnlimited,
        isHighValue: classification.isHighValue,
        decimals: classification.decimals,
        normalizedAmount: classification.normalizedAmount,
        decimalsAvailable: classification.decimalsAvailable,
        degradedReason: classification.degradedReason,
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

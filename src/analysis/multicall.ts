/**
 * ActionProof Recursive Multicall Decoder
 *
 * WHAT it guarantees:
 * - Deterministically unpacks supported Multicall / batch wrappers:
 *   - `multicall(bytes[])`
 *   - `multicall(uint256,bytes[])`
 *   - `aggregate((address,bytes)[])`
 *   - `aggregate3((address,bool,bytes)[])`
 * - Recursively analyzes nested calls down the call tree.
 * - Surfaces hidden dangerous actions (such as stealth approvals tucked behind a swap).
 * - Distinguishes between exact unlimited approvals and high-value approvals.
 *
 * WHAT it does NOT guarantee:
 * - Does not execute dynamic bytecode or analyze unmodeled custom aggregators.
 */

import { decodeFunctionData, parseAbi, type Hex } from 'viem';
import type { ApprovalDetail, CallTreeNode, DecodeEvidence } from '../evidence/types.js';
import { decodeTransactionCalldata } from './decoder.js';

export const MULTICALL_ABIS = parseAbi([
  'function multicall(bytes[] data) returns (bytes[] results)',
  'function multicall(uint256 deadline, bytes[] data) returns (bytes[] results)',
  'function aggregate((address target, bytes callData)[] calls) returns (uint256 blockNumber, bytes[] returnData)',
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) returns ((bool success, bytes returnData)[] returnData)',
]);

export function decodeMulticallIfPresent(
  target: `0x${string}`,
  data: `0x${string}`
): DecodeEvidence | null {
  const selector = data.slice(0, 10).toLowerCase();

  const isMulticallSelector = [
    '0xac9650d8',
    '0x5ae401dc',
    '0x252dba42',
    '0x82ad56cb',
  ].includes(selector);

  if (!isMulticallSelector) {
    return null;
  }

  try {
    const decoded = decodeFunctionData({
      abi: MULTICALL_ABIS,
      data: data as Hex,
    });

    let callsToUnpack: Array<{ target: `0x${string}`; callData: `0x${string}` }> = [];

    if (decoded.functionName === 'multicall') {
      const args = decoded.args;
      let subcalls: readonly `0x${string}`[];
      if (args.length === 1) {
        subcalls = args[0] as readonly `0x${string}`[];
      } else {
        subcalls = args[1] as readonly `0x${string}`[];
      }
      callsToUnpack = subcalls.map((subData) => ({
        target,
        callData: subData,
      }));
    } else if (decoded.functionName === 'aggregate') {
      const calls = decoded.args[0] as readonly { target: string; callData: Hex }[];
      callsToUnpack = calls.map((c) => ({
        target: c.target.toLowerCase() as `0x${string}`,
        callData: c.callData as `0x${string}`,
      }));
    } else if (decoded.functionName === 'aggregate3') {
      const calls = decoded.args[0] as readonly { target: string; allowFailure: boolean; callData: Hex }[];
      callsToUnpack = calls.map((c) => ({
        target: c.target.toLowerCase() as `0x${string}`,
        callData: c.callData as `0x${string}`,
      }));
    }

    const allApprovals: ApprovalDetail[] = [];
    let hasExactUnlimited = false;
    let hasHighValue = false;
    let hasUnrecognizedSubcall = false;
    let hasNestedDanger = false;
    const childNodes: CallTreeNode[] = [];

    for (let i = 0; i < callsToUnpack.length; i++) {
      const sub = callsToUnpack[i];
      const subEvidence = decodeTransactionCalldata(sub.target, sub.callData);

      if (subEvidence.status === 'UNKNOWN_CALLDATA') {
        hasUnrecognizedSubcall = true;
      }
      if (subEvidence.hasExactUnlimitedApproval) {
        hasExactUnlimited = true;
      }
      if (subEvidence.hasHighValueApproval) {
        hasHighValue = true;
      }
      if (subEvidence.callTree.some(node => node.isDangerous)) {
        hasNestedDanger = true;
      }
      allApprovals.push(...subEvidence.detectedApprovals);

      if (subEvidence.callTree.length > 0) {
        for (const node of subEvidence.callTree) {
          childNodes.push({
            ...node,
            index: i,
            depth: node.depth + 1,
          });
        }
      } else {
        const isSubDangerous = subEvidence.status === 'UNKNOWN_CALLDATA';
        childNodes.push({
          index: i,
          depth: 1,
          target: sub.target,
          functionName: subEvidence.functionName ?? 'unknown',
          signature: subEvidence.signature ?? '0x',
          args: subEvidence.args ?? {},
          isDangerous: isSubDangerous,
          dangerReason: isSubDangerous ? 'Nested subcall contains unrecognized or un-decodable function calldata' : undefined,
        });
      }
    }

    const isDangerous = hasExactUnlimited || hasHighValue || hasUnrecognizedSubcall || hasNestedDanger;
    const dangerReason = hasExactUnlimited
      ? 'Nested subcall contains dangerous exact unlimited token approval (type(uint256).max)'
      : hasHighValue
      ? 'Nested subcall contains high-value token approval'
      : hasUnrecognizedSubcall
      ? 'Nested subcall contains unrecognized or un-decodable function calldata'
      : hasNestedDanger
      ? 'Nested batch contains dangerous action'
      : undefined;

    const rootNode: CallTreeNode = {
      index: 0,
      depth: 0,
      target,
      functionName: decoded.functionName,
      signature: `${decoded.functionName}(${callsToUnpack.length} calls)`,
      args: { callCount: callsToUnpack.length },
      isDangerous,
      dangerReason,
      children: childNodes,
    };

    return {
      status: 'MULTICALL_DECODED',
      functionName: decoded.functionName,
      signature: `${decoded.functionName}(${callsToUnpack.length} subcalls)`,
      args: { subcalls: childNodes.map(c => ({ function: c.functionName, args: c.args })) },
      callTree: [rootNode],
      detectedApprovals: allApprovals,
      hasExactUnlimitedApproval: hasExactUnlimited,
      hasHighValueApproval: hasHighValue,
    };
  } catch {
    return null;
  }
}

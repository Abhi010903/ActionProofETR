/**
 * ActionProof Provider Proxy
 *
 * WHAT it guarantees:
 * - Intercepts `eth_sendTransaction` at the controlled EIP-1193 provider boundary.
 * - Enforces Level-2 request binding:
 *   `commitment(canonical(verified_request)) == commitment(canonical(request_about_to_be_forwarded))`
 * - Fails closed immediately if any bound field changed after verification.
 * - Protects against in-flight mutation: creates an immutable forwarding snapshot immediately prior
 *   to pre-forward recheck and forwards that exact verified snapshot, neutralizing getter/accessor mutations
 *   and post-check concurrent tampering.
 * - Blocks forwarding: the underlying wallet provider receives NOTHING on mismatch or policy violation.
 * - Immediately rejects unknown transaction properties and unsupported transaction classes (EIP-7702, EIP-5792).
 *
 * WHAT it does NOT guarantee:
 * - Does not protect if the DApp possesses an alternate, unproxied provider instance (boundary limitation).
 * - Does not guarantee what the wallet signs after receiving the forwarded request (Level-3 / out of MVP).
 */

import { computeCommitment } from '../canonical/commitment.js';
import { SchemaValidationError, validateRequestShape } from '../canonical/schema.js';
import { serializeCanonicalToRpcPayload } from '../canonical/serializer.js';
import { createImmutableSnapshot } from './snapshot.js';
import type { SynchronizationBarrier } from './barrier.js';
import type { EIP1193Provider, RequestArguments } from './eip1193.js';
import { EvidencePipeline } from '../evidence/pipeline.js';
import type { CompleteEvidence, PolicyVerdict } from '../evidence/types.js';
import type { StructuredIntent } from '../intent/structured.js';
import type { PolicyRuleOptions, ProvenanceMode } from '../policy/index.js';

export type ActionProofVerdict = PolicyVerdict;

export interface ActionProofProxyOptions {
  activeChainId?: number;
  evidencePipeline?: EvidencePipeline;
  barrier?: SynchronizationBarrier;
  declaredAction?: string | StructuredIntent;
  throwOnBlock?: boolean;
  onWarningConfirmation?: (evidence: CompleteEvidence) => Promise<boolean>;
  provenanceMode?: ProvenanceMode;
  policyEngineOptions?: PolicyRuleOptions;
}

export interface ActionProofResult {
  verdict: ActionProofVerdict;
  txHash: string | null;
  reason?: string;
  detail?: string;
  forwardingStatus?: 'FORWARDED' | 'FORWARDED_AFTER_CONFIRMATION' | 'BLOCKED_BEFORE_FORWARDING' | 'HALTED_AWAITING_CONFIRMATION';
  forwardingDetail?: string;
  commitment?: `0x${string}`;
  forwardCommitment?: `0x${string}` | null;
  evidence?: CompleteEvidence;
  blockedBeforeForwarding: boolean;
}

export const UNSUPPORTED_DANGEROUS_METHODS = new Set([
  'eth_sendRawTransaction',
  'eth_signTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'wallet_sendTransaction',
  'wallet_sendCalls',
  'wallet_sign',
  'eth_sendUserOperation',
  'eth_estimateUserOperationGas',
]);

function deepClone<T>(obj: T, seen = new WeakMap<object, unknown>()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (seen.has(obj)) {
    return seen.get(obj) as T;
  }
  if (Array.isArray(obj)) {
    const arr: unknown[] = [];
    seen.set(obj, arr);
    for (let i = 0; i < obj.length; i++) {
      arr.push(deepClone(obj[i], seen));
    }
    return arr as T;
  }
  const proto = Object.getPrototypeOf(obj);
  const cloned = Object.create(proto) as Record<string | symbol, unknown>;
  seen.set(obj, cloned);
  for (const key of Reflect.ownKeys(obj)) {
    try {
      const val = (obj as Record<string | symbol, unknown>)[key];
      cloned[key] = deepClone(val, seen);
    } catch {
      // Ignore accessor errors during traversal
    }
  }
  return cloned as T;
}

function deepFreeze<T>(obj: T, seen = new WeakSet<object>()): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (seen.has(obj)) {
    return obj as Readonly<T>;
  }
  seen.add(obj);

  for (const key of Reflect.ownKeys(obj)) {
    try {
      const val = (obj as Record<string | symbol, unknown>)[key];
      if (val !== null && typeof val === 'object') {
        deepFreeze(val, seen);
      }
    } catch {
      // Ignore accessor errors during freeze traversal
    }
  }

  return Object.freeze(obj) as Readonly<T>;
}

export class ActionProofProviderProxy implements EIP1193Provider {
  public activeChainId: number;
  private wallet: EIP1193Provider;
  private pipeline: EvidencePipeline;
  private barrier: SynchronizationBarrier;
  private declaredAction: string | StructuredIntent;
  private throwOnBlock: boolean;
  private onWarningConfirmation?: (evidence: CompleteEvidence) => Promise<boolean>;

  constructor(wallet: EIP1193Provider, options: ActionProofProxyOptions = {}) {
    this.wallet = wallet;
    this.activeChainId = options.activeChainId ?? 1;
    this.pipeline = options.evidencePipeline ?? new EvidencePipeline({
      provenanceMode: options.provenanceMode,
      policyEngineOptions: options.policyEngineOptions,
    });
    this.barrier = options.barrier ?? (async () => {});
    this.declaredAction = options.declaredAction ?? 'Swap 100 USDC -> ETH';
    this.throwOnBlock = options.throwOnBlock ?? false;
    this.onWarningConfirmation = options.onWarningConfirmation;
  }

  setBarrier(barrier: SynchronizationBarrier): void {
    this.barrier = barrier;
  }

  setDeclaredAction(action: string | StructuredIntent): void {
    this.declaredAction = action;
  }

  setOnWarningConfirmation(callback?: (evidence: CompleteEvidence) => Promise<boolean>): void {
    this.onWarningConfirmation = callback;
  }

  async request(args: RequestArguments): Promise<unknown> {
    const { method, params } = args;

    // Explicitly reject unhandled signing and alternative sending methods (M7 & SEC-AA-01)
    if (UNSUPPORTED_DANGEROUS_METHODS.has(method)) {
      const reason =
        method === 'wallet_sendCalls' ||
        method === 'eth_sendUserOperation' ||
        method === 'eth_estimateUserOperationGas'
          ? `UNSUPPORTED_WRITE_PATH:${method}`
          : `UNSUPPORTED_SIGNING_METHOD:${method}`;
      const detail = `Method ${method} generates signatures or transactions outside the supported EIP-1193 pre-signing gate.`;
      const result: ActionProofResult = {
        verdict: 'UNSUPPORTED',
        txHash: null,
        reason,
        detail,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        forwardingDetail: 'UNSUPPORTED_METHOD_REJECTED',
        blockedBeforeForwarding: true,
      };
      if (this.throwOnBlock) {
        throw new Error(`ActionProof blocked request: ${result.reason}`);
      }
      return result;
    }

    // Intercept standard Ethereum transaction dispatch
    if (method === 'eth_sendTransaction') {
      return this.handleSendTransaction(params);
    }

    // Pass through non-modifying read calls and keep chain ID synchronized
    if (method === 'eth_chainId') {
      const chainHex = await this.wallet.request(args);
      if (typeof chainHex === 'string') {
        this.activeChainId = Number(BigInt(chainHex));
      } else if (typeof chainHex === 'number') {
        this.activeChainId = chainHex;
      }
      return chainHex;
    }

    // Forward any other query directly to underlying wallet
    return this.wallet.request(args);
  }

  private async handleSendTransaction(params: unknown): Promise<ActionProofResult> {
    if (!params || !Array.isArray(params) || params.length === 0) {
      return {
        verdict: 'BLOCKED',
        txHash: null,
        reason: 'INVALID_PARAMS',
        detail: 'eth_sendTransaction requires array containing transaction object',
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
    }

    const liveRequest = params[0] as Record<string, unknown>;

    // Step 0: Dynamically synchronize active chain ID with wallet (H4)
    let activeWalletChainId: number;
    try {
      const rawWalletChain = await this.wallet.request({ method: 'eth_chainId' });
      if (typeof rawWalletChain === 'string') {
        activeWalletChainId = Number(BigInt(rawWalletChain));
      } else if (typeof rawWalletChain === 'number') {
        activeWalletChainId = rawWalletChain;
      } else {
        activeWalletChainId = this.activeChainId;
      }
      this.activeChainId = activeWalletChainId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        verdict: 'BLOCKED',
        txHash: null,
        reason: 'WALLET_CHAIN_QUERY_FAILED',
        detail: `Failed to query active wallet chain ID: ${message}`,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
    }

    // M3 Security Hardening: Capture request-scoped immutable declaredAction snapshot
    // Prevents post-verification mutation of proxy.declaredAction or structured intent properties
    const requestScopedIntent: string | StructuredIntent = typeof this.declaredAction === 'string'
      ? this.declaredAction
      : deepFreeze(createImmutableSnapshot(this.declaredAction) as StructuredIntent);

    // 1. Validate and canonicalize initial request snapshot (M1 & H4)
    let verifiedCommitment;
    let snapshot: Record<string, unknown>;
    try {
      snapshot = createImmutableSnapshot(liveRequest) as Record<string, unknown>;
      validateRequestShape(snapshot);

      // Verify payload chainId if present against synchronized wallet chainId
      if (snapshot.chainId !== undefined && snapshot.chainId !== null) {
        let reqChainId: number;
        try {
          reqChainId = Number(BigInt(snapshot.chainId as string | number | bigint));
        } catch {
          throw new SchemaValidationError('INVALID_CHAIN_ID', `Payload chainId could not be parsed: ${String(snapshot.chainId)}`);
        }
        if (reqChainId !== activeWalletChainId) {
          const result: ActionProofResult = {
            verdict: 'BLOCKED',
            txHash: null,
            reason: 'CHAIN_ID_MISMATCH',
            detail: `Payload chainId (${reqChainId}) does not match active wallet chainId (${activeWalletChainId})`,
            forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
            blockedBeforeForwarding: true,
          };
          if (this.throwOnBlock) {
            throw new Error(`ActionProof blocked request: ${result.reason} - ${result.detail}`);
          }
          return result;
        }
      }

      verifiedCommitment = computeCommitment(snapshot, activeWalletChainId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isSchemaError = err instanceof SchemaValidationError;
      let code = isSchemaError ? err.code : 'SCHEMA_VALIDATION_FAILED';
      if (!isSchemaError && err instanceof Error) {
        if (err.message.includes('PROTOTYPE_POLLUTION')) code = 'PROTOTYPE_POLLUTION';
        else if (err.message.includes('INVALID_PROTOTYPE')) code = 'INVALID_PROTOTYPE';
      }

      const isUnsupported = isSchemaError &&
        (err.code.startsWith('UNSUPPORTED_FIELD') ||
         err.code.startsWith('UNSUPPORTED_TX_TYPE') ||
         err.code === 'UNSUPPORTED_CONTRACT_CREATION');
      const verdict = isUnsupported ? 'UNSUPPORTED' : 'BLOCKED';

      const result: ActionProofResult = {
        verdict,
        txHash: null,
        reason: code,
        detail: message,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
      if (this.throwOnBlock) {
        throw new Error(`ActionProof blocked request: ${result.reason} - ${result.detail}`);
      }
      return result;
    }

    // 2. Run Evidence Pipeline & Deterministic Policy over the immutable snapshot
    const evidence = await this.pipeline.runPipeline(
      verifiedCommitment.canonical,
      verifiedCommitment,
      requestScopedIntent
    );

    // If initial policy check fails, fail closed: DO NOT call barrier or wallet
    if (evidence.policy.verdict === 'BLOCKED' || evidence.policy.verdict === 'UNSUPPORTED') {
      evidence.binding.status = 'BLOCKED';
      evidence.binding.mismatchReason = evidence.policy.primaryReason;

      const result: ActionProofResult = {
        verdict: evidence.policy.verdict,
        txHash: null,
        reason: evidence.policy.primaryReason,
        commitment: verifiedCommitment.hash,
        evidence,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
      if (this.throwOnBlock) {
        throw new Error(`ActionProof blocked request: ${result.reason}`);
      }
      return result;
    }

    // 3. Synchronization barrier hook (used for deterministic testing, e.g. Test 7)
    await this.barrier(liveRequest);

    // 4. Gate WARNING verdicts before wallet dispatch (H3 & M3)
    let isWarningForwardConfirmed = false;
    if (evidence.policy.verdict === 'WARNING') {
      if (!this.onWarningConfirmation) {
        // Even when unconfirmed, verify liveRequest was not mutated by barrier prior to halting
        let unconfirmedPayload: Record<string, unknown>;
        try {
          unconfirmedPayload = createImmutableSnapshot(liveRequest) as Record<string, unknown>;
          validateRequestShape(unconfirmedPayload);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            verdict: 'BLOCKED',
            txHash: null,
            reason: 'UNCANONICALIZABLE_FORWARD_REQUEST',
            detail: `Failed to snapshot forward request: ${message}`,
            commitment: verifiedCommitment.hash,
            evidence,
            forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
            blockedBeforeForwarding: true,
          };
        }

        let unconfirmedCommitment;
        try {
          unconfirmedCommitment = computeCommitment(unconfirmedPayload, activeWalletChainId);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          evidence.binding.status = 'MISMATCH';
          evidence.binding.mismatchReason = `Forward request failed canonicalization: ${message}`;
          evidence.policy.verdict = 'BLOCKED';
          evidence.policy.primaryReason = 'Request mutated into an uncanonicalizable state prior to forwarding';

          const result: ActionProofResult = {
            verdict: 'BLOCKED',
            txHash: null,
            reason: 'UNCANONICALIZABLE_FORWARD_REQUEST',
            detail: message,
            commitment: verifiedCommitment.hash,
            evidence,
            forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
            blockedBeforeForwarding: true,
          };
          if (this.throwOnBlock) {
            throw new Error(`ActionProof blocked request: ${result.reason}`);
          }
          return result;
        }

        if (unconfirmedCommitment.hash !== verifiedCommitment.hash) {
          evidence.binding.status = 'MISMATCH';
          evidence.binding.forwardCommitment = unconfirmedCommitment.hash;
          evidence.binding.mismatchReason = 'Pre-forward commitment does not match verified commitment';
          evidence.policy.verdict = 'BLOCKED';
          evidence.policy.primaryReason = 'Request parameters mutated after verification';

          const result: ActionProofResult = {
            verdict: 'BLOCKED',
            txHash: null,
            reason: 'COMMITMENT_MISMATCH',
            detail: `Verified [${verifiedCommitment.hash.slice(0, 10)}...] != Forward [${unconfirmedCommitment.hash.slice(0, 10)}...]`,
            commitment: verifiedCommitment.hash,
            forwardCommitment: unconfirmedCommitment.hash,
            evidence,
            forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
            blockedBeforeForwarding: true,
          };
          if (this.throwOnBlock) {
            throw new Error(`ActionProof blocked request: ${result.reason} - ${result.detail}`);
          }
          return result;
        }

        // Request was not mutated, but policy is WARNING and unconfirmed: halt fail-closed
        evidence.binding.status = 'BLOCKED';
        evidence.binding.mismatchReason = 'WARNING_UNCONFIRMED: Policy returned WARNING (degraded/unverified evidence) and no confirmation callback was provided';

        const result: ActionProofResult = {
          verdict: 'WARNING',
          txHash: null,
          reason: evidence.policy.primaryReason,
          detail: 'Transaction produces policy WARNING and no confirmation callback was configured. Halted fail-closed before wallet.',
          commitment: verifiedCommitment.hash,
          forwardCommitment: unconfirmedCommitment.hash,
          evidence,
          forwardingStatus: 'HALTED_AWAITING_CONFIRMATION',
          forwardingDetail: 'UNCONFIRMED_WARNING_HALT',
          blockedBeforeForwarding: true,
        };
        if (this.throwOnBlock) {
          throw new Error(`ActionProof halted WARNING request: ${result.reason}`);
        }
        return result;
      }

      // M3 Hardening: Deep-clone and freeze evidence so callback cannot mutate verdict, canonical request, or intent
      const frozenCallbackEvidence = deepFreeze(deepClone(evidence));

      let rawCallbackResult: unknown;
      try {
        rawCallbackResult = await this.onWarningConfirmation(frozenCallbackEvidence);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        evidence.binding.status = 'BLOCKED';
        evidence.binding.mismatchReason = `WARNING_CONFIRMATION_ERROR: ${message}`;
        const result: ActionProofResult = {
          verdict: 'WARNING',
          txHash: null,
          reason: evidence.policy.primaryReason,
          detail: `Confirmation callback threw error: ${message}`,
          commitment: verifiedCommitment.hash,
          forwardCommitment: verifiedCommitment.hash,
          evidence,
          forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
          forwardingDetail: 'CONFIRMATION_ERROR',
          blockedBeforeForwarding: true,
        };
        if (this.throwOnBlock) {
          throw new Error(`ActionProof halted WARNING request: ${result.reason}`);
        }
        return result;
      }

      // M3 Hardening: Strict boolean confirmation. Discards any modified transaction returned from callback.
      const confirmed = rawCallbackResult === true;

      if (!confirmed) {
        evidence.binding.status = 'BLOCKED';
        evidence.binding.mismatchReason = 'WARNING_REJECTED: User/caller rejected forwarding of WARNING transaction';

        const result: ActionProofResult = {
          verdict: 'WARNING',
          txHash: null,
          reason: evidence.policy.primaryReason,
          detail: 'Transaction produces policy WARNING and was rejected by confirmation callback.',
          commitment: verifiedCommitment.hash,
          forwardCommitment: verifiedCommitment.hash,
          evidence,
          forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
          forwardingDetail: 'CONFIRMATION_REJECTED',
          blockedBeforeForwarding: true,
        };
        if (this.throwOnBlock) {
          throw new Error(`ActionProof halted WARNING request: ${result.reason}`);
        }
        return result;
      }

      isWarningForwardConfirmed = true;
    }

    // 5. Pre-forward Level-2 Recheck (Pre-Forward Mutation & Chain Detection)
    // Runs right before wallet dispatch to catch any post-verification mutations (from barrier or callback).
    let forwardPayload: Record<string, unknown>;
    try {
      forwardPayload = createImmutableSnapshot(liveRequest) as Record<string, unknown>;
      validateRequestShape(forwardPayload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        verdict: 'BLOCKED',
        txHash: null,
        reason: 'UNCANONICALIZABLE_FORWARD_REQUEST',
        detail: `Failed to snapshot forward request: ${message}`,
        commitment: verifiedCommitment.hash,
        evidence,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
    }

    // Verify wallet chainId hasn't changed concurrently (H4)
    try {
      const preForwardChain = await this.wallet.request({ method: 'eth_chainId' });
      const currentWalletChainId = typeof preForwardChain === 'string'
        ? Number(BigInt(preForwardChain))
        : (typeof preForwardChain === 'number' ? preForwardChain : activeWalletChainId);

      if (currentWalletChainId !== activeWalletChainId) {
        evidence.binding.status = 'MISMATCH';
        evidence.binding.mismatchReason = `Concurrent wallet chain switch detected: was ${activeWalletChainId}, now ${currentWalletChainId}`;
        evidence.policy.verdict = 'BLOCKED';
        evidence.policy.primaryReason = 'Wallet chain changed concurrently during verification';

        const result: ActionProofResult = {
          verdict: 'BLOCKED',
          txHash: null,
          reason: 'CONCURRENT_CHAIN_SWITCH',
          detail: `Active chain changed from ${activeWalletChainId} to ${currentWalletChainId} during verification`,
          commitment: verifiedCommitment.hash,
          evidence,
          forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
          blockedBeforeForwarding: true,
        };
        if (this.throwOnBlock) {
          throw new Error(`ActionProof blocked request: ${result.reason} - ${result.detail}`);
        }
        return result;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        verdict: 'BLOCKED',
        txHash: null,
        reason: 'CONCURRENT_CHAIN_QUERY_FAILED',
        detail: `Failed to recheck wallet chain ID prior to forwarding: ${message}`,
        commitment: verifiedCommitment.hash,
        evidence,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
    }

    // Immediately recompute commitment on the exact snapshot about to be forwarded
    let forwardCommitment;
    try {
      forwardCommitment = computeCommitment(forwardPayload, activeWalletChainId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      evidence.binding.status = 'MISMATCH';
      evidence.binding.mismatchReason = `Forward request failed canonicalization: ${message}`;
      evidence.policy.verdict = 'BLOCKED';
      evidence.policy.primaryReason = 'Request mutated into an uncanonicalizable state prior to forwarding';

      const result: ActionProofResult = {
        verdict: 'BLOCKED',
        txHash: null,
        reason: 'UNCANONICALIZABLE_FORWARD_REQUEST',
        detail: message,
        commitment: verifiedCommitment.hash,
        evidence,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
      if (this.throwOnBlock) {
        throw new Error(`ActionProof blocked request: ${result.reason}`);
      }
      return result;
    }

    // Strict commitment equality invariant: catches any barrier or callback mutation
    if (forwardCommitment.hash !== verifiedCommitment.hash) {
      evidence.binding.status = 'MISMATCH';
      evidence.binding.forwardCommitment = forwardCommitment.hash;
      evidence.binding.mismatchReason = 'Pre-forward commitment does not match verified commitment';
      evidence.policy.verdict = 'BLOCKED';
      evidence.policy.primaryReason = 'Request parameters mutated after verification';

      const result: ActionProofResult = {
        verdict: 'BLOCKED',
        txHash: null,
        reason: 'COMMITMENT_MISMATCH',
        detail: `Verified [${verifiedCommitment.hash.slice(0, 10)}...] != Forward [${forwardCommitment.hash.slice(0, 10)}...]`,
        commitment: verifiedCommitment.hash,
        forwardCommitment: forwardCommitment.hash,
        evidence,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
      if (this.throwOnBlock) {
        throw new Error(`ActionProof blocked request: ${result.reason} - ${result.detail}`);
      }
      return result;
    }

    // Commitments match! Record match in binding evidence
    evidence.binding.status = 'MATCH';
    evidence.binding.forwardCommitment = forwardCommitment.hash;

    // 6. Forward the verified, rechecked canonical representation to the wallet provider (M2 & M3).
    // The forwarded payload is serialized strictly from the verified canonical representation.
    const forwardRpcPayload = serializeCanonicalToRpcPayload(verifiedCommitment.canonical);

    // M3 Security Property Verification:
    // commitment(canonical(verifiedImmutableRequest)) === commitment(canonical(requestActuallyForwarded))
    const dispatchedCommitment = computeCommitment(forwardRpcPayload, activeWalletChainId);
    if (dispatchedCommitment.hash !== verifiedCommitment.hash) {
      evidence.binding.status = 'MISMATCH';
      evidence.binding.mismatchReason = 'Dispatched RPC payload commitment does not match verified commitment';
      evidence.policy.verdict = 'BLOCKED';
      evidence.policy.primaryReason = 'Dispatched payload divergence detected prior to wallet transmission';

      const result: ActionProofResult = {
        verdict: 'BLOCKED',
        txHash: null,
        reason: 'DISPATCH_COMMITMENT_MISMATCH',
        detail: `Verified [${verifiedCommitment.hash.slice(0, 10)}...] != Dispatch [${dispatchedCommitment.hash.slice(0, 10)}...]`,
        commitment: verifiedCommitment.hash,
        forwardCommitment: dispatchedCommitment.hash,
        evidence,
        forwardingStatus: 'BLOCKED_BEFORE_FORWARDING',
        blockedBeforeForwarding: true,
      };
      if (this.throwOnBlock) {
        throw new Error(`ActionProof blocked request: ${result.reason} - ${result.detail}`);
      }
      return result;
    }

    const rawTxHash = await this.wallet.request({
      method: 'eth_sendTransaction',
      params: [forwardRpcPayload],
    });
    const txHash = typeof rawTxHash === 'string' ? rawTxHash : String(rawTxHash);

    const isDemoVerified = evidence.policy.verdict === 'DEMO_VERIFIED';

    return {
      verdict: evidence.policy.verdict,
      txHash,
      reason: evidence.policy.primaryReason,
      forwardingStatus: isWarningForwardConfirmed ? 'FORWARDED_AFTER_CONFIRMATION' : 'FORWARDED',
      forwardingDetail: isWarningForwardConfirmed
        ? 'FORWARDED_AFTER_CONFIRMATION'
        : (isDemoVerified ? 'DEMO_VERIFIED_FORWARD' : 'VERIFIED_FORWARD'),
      commitment: verifiedCommitment.hash,
      forwardCommitment: forwardCommitment.hash,
      evidence,
      blockedBeforeForwarding: false,
    };
  }
}

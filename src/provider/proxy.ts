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
import { createImmutableSnapshot } from './snapshot.js';
import type { SynchronizationBarrier } from './barrier.js';
import type { EIP1193Provider, RequestArguments } from './eip1193.js';
import { EvidencePipeline } from '../evidence/pipeline.js';
import type { CompleteEvidence } from '../evidence/types.js';

export interface ActionProofProxyOptions {
  activeChainId?: number;
  evidencePipeline?: EvidencePipeline;
  barrier?: SynchronizationBarrier;
  declaredAction?: string;
  throwOnBlock?: boolean;
}

export interface ActionProofResult {
  verdict: 'VERIFIED' | 'WARNING' | 'BLOCKED' | 'UNSUPPORTED';
  txHash: string | null;
  reason?: string;
  detail?: string;
  commitment?: `0x${string}`;
  forwardCommitment?: `0x${string}` | null;
  evidence?: CompleteEvidence;
  blockedBeforeForwarding: boolean;
}

export class ActionProofProviderProxy implements EIP1193Provider {
  public activeChainId: number;
  private wallet: EIP1193Provider;
  private pipeline: EvidencePipeline;
  private barrier: SynchronizationBarrier;
  private declaredAction: string;
  private throwOnBlock: boolean;

  constructor(wallet: EIP1193Provider, options: ActionProofProxyOptions = {}) {
    this.wallet = wallet;
    this.activeChainId = options.activeChainId ?? 1;
    this.pipeline = options.evidencePipeline ?? new EvidencePipeline();
    this.barrier = options.barrier ?? (async () => {});
    this.declaredAction = options.declaredAction ?? 'Swap 100 USDC -> ETH';
    this.throwOnBlock = options.throwOnBlock ?? false;
  }

  setBarrier(barrier: SynchronizationBarrier): void {
    this.barrier = barrier;
  }

  setDeclaredAction(action: string): void {
    this.declaredAction = action;
  }

  async request(args: RequestArguments): Promise<unknown> {
    const { method, params } = args;

    // Explicitly reject unsupported alternative write paths per EIP-5792
    if (method === 'wallet_sendCalls') {
      const result: ActionProofResult = {
        verdict: 'UNSUPPORTED',
        txHash: null,
        reason: 'UNSUPPORTED_WRITE_PATH:wallet_sendCalls',
        detail: 'EIP-5792 wallet_sendCalls is outside the MVP supported boundary',
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
        blockedBeforeForwarding: true,
      };
    }

    const liveRequest = params[0] as Record<string, unknown>;

    // 1. Validate and canonicalize initial request snapshot
    let verifiedCommitment;
    let snapshot;
    try {
      snapshot = createImmutableSnapshot(liveRequest);
      validateRequestShape(snapshot);
      verifiedCommitment = computeCommitment(snapshot, this.activeChainId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isSchemaError = err instanceof SchemaValidationError;
      const code = isSchemaError ? err.code : 'SCHEMA_VALIDATION_FAILED';

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
      this.declaredAction
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
        blockedBeforeForwarding: true,
      };
      if (this.throwOnBlock) {
        throw new Error(`ActionProof blocked request: ${result.reason}`);
      }
      return result;
    }

    // 3. Synchronization barrier hook (used for deterministic testing, e.g. Test 7)
    await this.barrier(liveRequest);

    // 4. Create an immutable verified forwarding snapshot immediately prior to pre-forward recheck.
    // This isolates the forwarded request from concurrent mutations, nested accessList alterations,
    // and adversarial ES6 getter/proxy mutators that return divergent values on subsequent property reads.
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
        blockedBeforeForwarding: true,
      };
    }

    // 5. Pre-forward recheck: immediately recompute commitment on the exact snapshot about to be forwarded
    let forwardCommitment;
    try {
      forwardCommitment = computeCommitment(forwardPayload, this.activeChainId);
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
        blockedBeforeForwarding: true,
      };
      if (this.throwOnBlock) {
        throw new Error(`ActionProof blocked request: ${result.reason}`);
      }
      return result;
    }

    // Strict commitment equality invariant
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

    // 6. Forward the verified, rechecked, immutable snapshot to the wallet provider.
    // This guarantees that the object forwarded is identical to the one whose commitment was rechecked.
    const rawTxHash = await this.wallet.request({
      method: 'eth_sendTransaction',
      params: [forwardPayload],
    });
    const txHash = typeof rawTxHash === 'string' ? rawTxHash : String(rawTxHash);

    return {
      verdict: evidence.policy.verdict,
      txHash,
      reason: evidence.policy.primaryReason,
      commitment: verifiedCommitment.hash,
      forwardCommitment: forwardCommitment.hash,
      evidence,
      blockedBeforeForwarding: false,
    };
  }
}

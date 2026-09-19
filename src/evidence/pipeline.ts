/**
 * ActionProof Evidence Pipeline Orchestrator
 *
 * WHAT it guarantees:
 * - Coordinates independent decoding, contract correspondence, clear-signing, and simulation.
 * - Enforces immutable data flow into the deterministic policy engine.
 * - Honestly defaults to UnavailableSimulationAdapter when no live simulation service is configured.
 * - Distinguishes between LIVE_EXTERNAL and LOCAL_FIXTURE evidence provenance.
 * - Assembles a fully structured CompleteEvidence record for UI and audit logs.
 *
 * WHAT it does NOT guarantee:
 * - Evidence gathering does not guarantee that off-chain or RPC dependencies are infallible.
 */

import type { CanonicalTransactionRequest, RequestCommitment } from '../canonical/types.js';
import type {
  CompleteEvidence,
  ApplicationEvidence,
  TransactionEvidence,
  BindingEvidence,
} from './types.js';
import { decodeTransactionCalldata } from '../analysis/decoder.js';
import {
  type ContractEvidenceProvider,
  SourcifyContractAdapter,
} from '../analysis/contract.js';
import {
  type SimulationAdapter,
  UnavailableSimulationAdapter,
} from '../analysis/simulation.js';
import {
  type IntentProvider,
  ERC7730v2Adapter,
} from '../intent/index.js';
import { DeterministicPolicyEngine } from '../policy/index.js';

export interface EvidencePipelineOptions {
  contractProvider?: ContractEvidenceProvider;
  simulationAdapter?: SimulationAdapter;
  intentProvider?: IntentProvider;
  policyEngine?: DeterministicPolicyEngine;
}

export class EvidencePipeline {
  public readonly contractProvider: ContractEvidenceProvider;
  public readonly simulationAdapter: SimulationAdapter;
  public readonly intentProvider: IntentProvider;
  public readonly policyEngine: DeterministicPolicyEngine;

  constructor(options: EvidencePipelineOptions = {}) {
    this.contractProvider = options.contractProvider ?? new SourcifyContractAdapter();
    this.simulationAdapter = options.simulationAdapter ?? new UnavailableSimulationAdapter();
    this.intentProvider = options.intentProvider ?? new ERC7730v2Adapter();
    this.policyEngine = options.policyEngine ?? new DeterministicPolicyEngine();
  }

  async runPipeline(
    canonical: CanonicalTransactionRequest,
    commitment: RequestCommitment,
    declaredAction = 'Swap 100 USDC -> ETH',
    actionSource: 'DAPP_UI' | 'TEST_FIXTURE' = 'DAPP_UI'
  ): Promise<CompleteEvidence> {
    // 1. Application evidence (explicitly marked as untrusted claim)
    const application: ApplicationEvidence = {
      status: declaredAction ? 'AVAILABLE' : 'ABSENT',
      declaredAction,
      source: actionSource,
      isUntrustedClaim: true,
    };

    // 2. Transaction evidence
    const transaction: TransactionEvidence = {
      status: 'CAPTURED',
      canonical,
      activeChainId: canonical.chainId,
    };

    // 3. Initial binding evidence before pre-forward recheck
    const binding: BindingEvidence = {
      status: 'NOT_RECHECKED',
      level: 'LEVEL_2',
      finalSignedPayloadNotice: 'OUTSIDE_MVP',
      verifiedCommitment: commitment.hash,
      forwardCommitment: null,
      mismatchReason: null,
    };

    // 4. Independent decode (ABI + Multicall)
    const decode = decodeTransactionCalldata(canonical.to, canonical.data);

    // 5. External contract verification evidence
    const contract = await this.contractProvider.getContractEvidence(canonical.to, canonical.chainId);

    // 6. Clear-Signing / ERC-7730 evidence
    const intent = await this.intentProvider.resolveIntent(
      canonical.to,
      canonical.chainId,
      canonical.data,
      decode
    );

    // 7. Simulation evidence
    const simulation = await this.simulationAdapter.simulate(canonical);

    // 8. Pure deterministic policy evaluation
    const policy = this.policyEngine.evaluate({
      application,
      transaction,
      binding,
      decode,
      contract,
      intent,
      simulation,
    });

    return {
      application,
      transaction,
      binding,
      decode,
      contract,
      intent,
      simulation,
      policy,
    };
  }
}

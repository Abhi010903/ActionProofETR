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
  MockLiveContractAdapter,
  LiveSourcifyContractAdapter,
} from '../analysis/contract.js';
import {
  type SimulationAdapter,
  type LiveRPCSimulationProvider,
  UnavailableSimulationAdapter,
  MockLiveSimulationAdapter,
  LiveRPCSimulationAdapter,
} from '../analysis/simulation.js';
import {
  type IntentProvider,
  ERC7730v2Adapter,
  MockLiveERC7730Adapter,
  LiveRegistryERC7730Adapter,
  LOCAL_DESCRIPTOR_FIXTURES,
  resolveStructuredIntent,
  type StructuredIntent,
} from '../intent/index.js';
import { DeterministicPolicyEngine, type PolicyRuleOptions, type ProvenanceMode } from '../policy/index.js';

export interface EvidencePipelineOptions {
  contractProvider?: ContractEvidenceProvider;
  contractAdapter?: ContractEvidenceProvider;
  simulationAdapter?: SimulationAdapter;
  intentProvider?: IntentProvider;
  erc7730Adapter?: IntentProvider;
  policyEngine?: DeterministicPolicyEngine;
  policyEngineOptions?: PolicyRuleOptions;
  provenanceMode?: ProvenanceMode;
}

export class EvidencePipeline {
  public readonly contractProvider: ContractEvidenceProvider;
  public readonly simulationAdapter: SimulationAdapter;
  public readonly intentProvider: IntentProvider;
  public readonly policyEngine: DeterministicPolicyEngine;

  constructor(options: EvidencePipelineOptions = {}) {
    this.contractProvider = options.contractProvider ?? options.contractAdapter ?? new SourcifyContractAdapter();
    this.simulationAdapter = options.simulationAdapter ?? new UnavailableSimulationAdapter();
    this.intentProvider = options.intentProvider ?? options.erc7730Adapter ?? new ERC7730v2Adapter();
    const policyOptions: PolicyRuleOptions = {
      ...(options.provenanceMode ? { provenanceMode: options.provenanceMode } : {}),
      ...(options.policyEngineOptions ?? {}),
    };
    this.policyEngine = options.policyEngine ?? new DeterministicPolicyEngine(policyOptions);
  }

  async runPipeline(
    canonical: CanonicalTransactionRequest,
    commitment: RequestCommitment,
    declaredAction: string | StructuredIntent = 'Swap 100 USDC -> ETH',
    actionSource: 'DAPP_UI' | 'TEST_FIXTURE' = 'DAPP_UI'
  ): Promise<CompleteEvidence> {
    const rawDeclaredAction = typeof declaredAction === 'string'
      ? declaredAction
      : (declaredAction?.rawDescription ?? `${declaredAction?.category ?? 'UNKNOWN'} action`);
    const structuredIntent = resolveStructuredIntent(declaredAction);

    // 1. Application evidence (explicitly marked as untrusted claim)
    const application: ApplicationEvidence = {
      status: rawDeclaredAction ? 'AVAILABLE' : 'ABSENT',
      declaredAction: rawDeclaredAction,
      structuredIntent,
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

export interface LiveEvidencePipelineOptions {
  sourcifyApiUrl?: string;
  rpcUrl?: string;
  rpcTimeoutMs?: number;
  registryUrl?: string;
}

/**
 * Creates an EvidencePipeline configured with live external evidence adapters.
 * Honestly queries external sources (Sourcify, EVM RPC, ERC-7730 registry).
 * Enforces strict PRODUCTION policy and fails closed if custom adapters or mock transports are injected.
 * Requires genuine external connections to achieve VERIFIED; an unconfigured
 * pipeline returns honest UNAVAILABLE/NONE evidence and never achieves VERIFIED.
 */
export function createLiveEvidencePipeline(options: LiveEvidencePipelineOptions = {}): EvidencePipeline {
  const anyOptions = options as Record<string, unknown>;
  const forbiddenCustomAdapterKeys = [
    'contractProvider',
    'contractAdapter',
    'simulationAdapter',
    'intentProvider',
    'erc7730Adapter',
    'policyEngine',
    'policyEngineOptions',
    'provenanceMode',
    'requireLiveSimulation',
    'requireLiveContractVerification',
    'rpcProvider',
    'sourcifyFetchFn',
    'rpcFetchFn',
    'registryFetchFn',
    'fetchFn',
  ];

  for (const key of forbiddenCustomAdapterKeys) {
    if (key in anyOptions && anyOptions[key] !== undefined) {
      throw new Error(
        `createLiveEvidencePipeline rejected custom transport or adapter injection '${key}'. Production pipeline does not accept mock transport injection.`
      );
    }
  }

  const policyOptions: PolicyRuleOptions = {
    provenanceMode: 'PRODUCTION',
    requireLiveSimulation: true,
    requireLiveContractVerification: true,
  };

  const contractProvider = new LiveSourcifyContractAdapter({
    apiUrl: options.sourcifyApiUrl,
  });

  const simulationAdapter = new LiveRPCSimulationAdapter({
    rpcUrl: options.rpcUrl,
    timeoutMs: options.rpcTimeoutMs,
  });

  const intentProvider = new LiveRegistryERC7730Adapter({
    registryUrl: options.registryUrl,
  });

  return new EvidencePipeline({
    contractProvider,
    intentProvider,
    simulationAdapter,
    policyEngine: new DeterministicPolicyEngine(policyOptions),
  });
}

export const DEFAULT_PUBLIC_ENDPOINTS: Readonly<Required<Omit<LiveEvidencePipelineOptions, 'rpcTimeoutMs'>> & { rpcTimeoutMs: number }> = Object.freeze({
  sourcifyApiUrl: 'https://sourcify.dev/server',
  rpcUrl: 'https://rpc.mevblocker.io',
  rpcTimeoutMs: 5000,
  registryUrl: 'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master',
});

/**
 * Creates an EvidencePipeline pre-configured with default free, public external evidence endpoints:
 * - Sourcify v2 API for contract metadata and verified ABI
 * - Ethereum public RPC for EVM execution simulation
 * - Official Ethereum ERC-7730 clear-signing registry
 * Still enforces strict PRODUCTION trust boundary: test doubles and mock transports are rejected.
 */
export function createPublicLiveEvidencePipeline(options: LiveEvidencePipelineOptions = {}): EvidencePipeline {
  return createLiveEvidencePipeline({
    ...options,
    sourcifyApiUrl: options.sourcifyApiUrl ?? DEFAULT_PUBLIC_ENDPOINTS.sourcifyApiUrl,
    rpcUrl: options.rpcUrl ?? DEFAULT_PUBLIC_ENDPOINTS.rpcUrl,
    rpcTimeoutMs: options.rpcTimeoutMs ?? DEFAULT_PUBLIC_ENDPOINTS.rpcTimeoutMs,
    registryUrl: options.registryUrl ?? DEFAULT_PUBLIC_ENDPOINTS.registryUrl,
  });
}


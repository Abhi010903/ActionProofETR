import {
  LiveSourcifyContractAdapter,
} from '../src/analysis/contract.js';
import {
  LiveRegistryERC7730Adapter,
} from '../src/intent/erc7730.js';
import {
  LiveRPCSimulationAdapter,
} from '../src/analysis/simulation.js';
import {
  createPublicLiveEvidencePipeline,
  DEFAULT_PUBLIC_ENDPOINTS,
} from '../src/evidence/pipeline.js';
import { computeCommitment } from '../src/canonical/commitment.js';
import type { DecodeEvidence } from '../src/evidence/types.js';
import type { CanonicalTransactionRequest } from '../src/canonical/types.js';

const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
const SENDER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;

async function runLiveSmokeTests() {
  console.log('=== ACTIONPROOF GENUINE LIVE SMOKE TESTS ===\n');

  // 1. Sourcify Live API Smoke Test
  console.log('[1/4] Contacting live Sourcify API v2:', DEFAULT_PUBLIC_ENDPOINTS.sourcifyApiUrl);
  const sourcifyAdapter = new LiveSourcifyContractAdapter({
    apiUrl: DEFAULT_PUBLIC_ENDPOINTS.sourcifyApiUrl,
  });
  const t0 = Date.now();
  const sourcifyEvidence = await sourcifyAdapter.getContractEvidence(ROUTER, 1);
  const sourcifyDuration = Date.now() - t0;
  console.log('Sourcify Outcome:', {
    status: sourcifyEvidence.status,
    provenance: sourcifyEvidence.provenance,
    matchType: sourcifyEvidence.matchType,
    contractName: sourcifyEvidence.contractName,
    compiler: sourcifyEvidence.compiler,
    abiFunctionsCount: sourcifyEvidence.abi ? sourcifyEvidence.abi.length : 0,
    durationMs: sourcifyDuration,
  });

  // 2. Official ERC-7730 Registry Smoke Test
  console.log('\n[2/4] Contacting live ERC-7730 Registry:', DEFAULT_PUBLIC_ENDPOINTS.registryUrl);
  const registryAdapter = new LiveRegistryERC7730Adapter({
    registryUrl: DEFAULT_PUBLIC_ENDPOINTS.registryUrl,
  });
  const mockDecode: DecodeEvidence = {
    status: 'DECODED',
    functionName: 'exactInputSingle',
    signature: 'exactInputSingle(...)',
    args: {
      tokenIn: USDC,
      tokenOut: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      fee: 3000,
      amountIn: '100000000',
      amountOutMinimum: '50000000000000000',
      recipient: SENDER,
    },
    callTree: [],
    detectedApprovals: [],
    hasExactUnlimitedApproval: false,
    hasHighValueApproval: false,
  };
  const t1 = Date.now();
  const registryEvidence = await registryAdapter.resolveIntent(ROUTER, 1, '0x04e45aaf', mockDecode);
  const registryDuration = Date.now() - t1;
  console.log('ERC-7730 Registry Outcome:', {
    status: registryEvidence.status,
    provenance: registryEvidence.provenance,
    descriptorId: registryEvidence.descriptorId,
    crossValidationMatches: registryEvidence.crossValidation.matches,
    intentDisplay: registryEvidence.intentDisplay,
    durationMs: registryDuration,
  });

  // 3. Ethereum RPC Simulation Smoke Test
  console.log('\n[3/4] Contacting live Ethereum RPC (read-only eth_call):', DEFAULT_PUBLIC_ENDPOINTS.rpcUrl);
  const rpcAdapter = new LiveRPCSimulationAdapter({
    rpcUrl: DEFAULT_PUBLIC_ENDPOINTS.rpcUrl,
  });
  // Read-only call: WETH totalSupply query
  const canonicalTx: CanonicalTransactionRequest = {
    domain: 'actionproof.request.v1',
    type: '0x2',
    from: SENDER,
    to: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    value: '0x0',
    data: '0x18160ddd', // totalSupply()
    chainId: 1,
    nonce: null,
    gas: null,
    gasPrice: null,
    maxFeePerGas: null,
    maxPriorityFeePerGas: null,
    accessList: [],
  };
  const t2 = Date.now();
  const simEvidence = await rpcAdapter.simulate(canonicalTx);
  const simDuration = Date.now() - t2;
  console.log('Ethereum RPC Simulation Outcome:', {
    status: simEvidence.status,
    provenance: simEvidence.provenance,
    success: simEvidence.success,
    blockNumber: simEvidence.blockNumber,
    revertReason: simEvidence.revertReason,
    durationMs: simDuration,
  });

  // 4. Full Public Live Pipeline Integration Smoke Test
  console.log('\n[4/4] Executing createPublicLiveEvidencePipeline() end-to-end:');
  const pipeline = createPublicLiveEvidencePipeline();
  const rawTx = {
    from: SENDER,
    to: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    value: '0x0',
    data: '0x18160ddd',
    chainId: 1,
  };
  const commitment = computeCommitment(rawTx);
  const t3 = Date.now();
  const fullEvidence = await pipeline.runPipeline(
    commitment.canonical,
    commitment,
    'Contract Call',
    'DAPP_UI'
  );
  const fullDuration = Date.now() - t3;
  console.log('End-to-End Live Pipeline Verdict:', {
    verdict: fullEvidence.policy.verdict,
    primaryReason: fullEvidence.policy.primaryReason,
    contractStatus: fullEvidence.contract.status,
    contractProvenance: fullEvidence.contract.provenance,
    intentStatus: fullEvidence.intent.status,
    intentProvenance: fullEvidence.intent.provenance,
    simulationStatus: fullEvidence.simulation.status,
    simulationProvenance: fullEvidence.simulation.provenance,
    totalDurationMs: fullDuration,
  });
  console.log('\n=== SMOKE TESTS COMPLETE ===');
}

runLiveSmokeTests().catch(console.error);

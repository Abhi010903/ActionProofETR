/**
 * ActionProof Simulation Evidence Adapter
 *
 * WHAT it guarantees:
 * - Honestly distinguishes between LIVE EVM simulation, LOCAL_FIXTURE simulation, and UNAVAILABLE.
 * - Defaults to UNAVAILABLE when no real external EVM simulation backend is configured.
 * - Captures simulated asset movements and approval state changes when a provider is available.
 * - Always includes explicit disclaimer that simulation is NOT a proof of future execution (TOCTOU).
 *
 * WHAT it does NOT guarantee:
 * - Does NOT guarantee future execution results if pending transactions or block state changes intervene.
 * - Does not manufacture fake simulation success when no real EVM engine is connected.
 */

import type { CanonicalTransactionRequest } from '../canonical/types.js';
import type { SimulationEvidence, AssetChange } from '../evidence/types.js';
import { decodeTransactionCalldata } from './decoder.js';

export interface SimulationAdapter {
  simulate(canonicalTx: CanonicalTransactionRequest): Promise<SimulationEvidence>;
}

export const MANDATORY_SIMULATION_DISCLAIMER =
  'State-specific execution evidence at the specified block context. Does NOT guarantee future execution if on-chain state diverges (TOCTOU limitation).';

/**
 * Default simulation adapter when no real EVM simulation service (e.g. Temper or EVM RPC) is connected.
 * Honestly reports UNAVAILABLE rather than fabricating execution results.
 */
export class UnavailableSimulationAdapter implements SimulationAdapter {
  constructor(
    private readonly reason = 'No live EVM simulation backend (e.g. Temper or debug_traceCall RPC) is configured.'
  ) {}

  async simulate(_canonicalTx: CanonicalTransactionRequest): Promise<SimulationEvidence> {
    return {
      status: 'UNAVAILABLE',
      provenance: 'NONE',
      blockNumber: null,
      stateContext: null,
      success: false,
      gasUsed: null,
      assetChanges: [],
      revertReason: this.reason,
      disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
    };
  }
}

/**
 * Deterministic local fixture adapter used strictly for automated testing and demonstration.
 * Explicitly labeled as LOCAL_FIXTURE so it cannot be misrepresented as live EVM execution.
 */
export class LocalFixtureSimulationAdapter implements SimulationAdapter {
  constructor(
    private readonly fixtureBlock = 20780100,
    private readonly baseFee = '15.5 Gwei'
  ) {}

  async simulate(canonicalTx: CanonicalTransactionRequest): Promise<SimulationEvidence> {
    const timestamp = Math.floor(Date.now() / 1000);
    const decoded = decodeTransactionCalldata(canonicalTx.to, canonicalTx.data);

    if (decoded.status === 'UNKNOWN_CALLDATA') {
      return {
        status: 'REVERTED',
        provenance: 'LOCAL_FIXTURE',
        blockNumber: this.fixtureBlock,
        stateContext: {
          timestamp,
          baseFee: this.baseFee,
        },
        success: false,
        gasUsed: null,
        assetChanges: [],
        revertReason: 'Execution reverted in fixture model: unrecognized function call data',
        disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
      };
    }

    const assetChanges: AssetChange[] = [];

    if (canonicalTx.value !== '0x0') {
      const ethAmount = (Number(BigInt(canonicalTx.value)) / 1e18).toFixed(4) + ' ETH';
      assetChanges.push({
        type: 'NATIVE',
        asset: 'ETH',
        from: canonicalTx.from,
        to: canonicalTx.to,
        amount: ethAmount,
      });
    }

    for (const approval of decoded.detectedApprovals) {
      assetChanges.push({
        type: 'ERC20',
        asset: `Approval (${approval.classification})`,
        from: canonicalTx.from,
        to: approval.spender,
        amount: approval.isExactUnlimited ? 'EXACT_UNLIMITED (type(uint256).max)' : approval.amount,
      });
    }

    if (decoded.functionName === 'transfer' && decoded.args) {
      assetChanges.push({
        type: 'ERC20',
        asset: 'ERC20 Token',
        from: canonicalTx.from,
        to: decoded.args.to as `0x${string}`,
        amount: String(decoded.args.amount),
      });
    } else if (decoded.functionName === 'exactInputSingle' && decoded.args) {
      assetChanges.push({
        type: 'ERC20',
        asset: 'USDC -> WETH',
        from: canonicalTx.from,
        to: canonicalTx.to,
        amount: `${String(decoded.args.amountIn)} USDC (min out: ${String(decoded.args.amountOutMinimum)})`,
      });
    }

    return {
      status: 'FIXTURE_SIMULATION',
      provenance: 'LOCAL_FIXTURE',
      blockNumber: this.fixtureBlock,
      stateContext: {
        timestamp,
        baseFee: this.baseFee,
      },
      success: true,
      gasUsed: '142,500',
      assetChanges,
      revertReason: null,
      disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
    };
  }
}

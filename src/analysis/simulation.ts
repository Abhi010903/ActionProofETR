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

/**
 * Mock simulation adapter for testing and demonstration.
 * Honestly emits LOCAL_FIXTURE provenance; strictly prevented from manufacturing LIVE_BACKEND.
 */
export class MockLiveSimulationAdapter implements SimulationAdapter {
  constructor(
    private readonly blockNumber = 20780100,
    private readonly baseFee = '15.5 Gwei'
  ) {}

  async simulate(canonicalTx: CanonicalTransactionRequest): Promise<SimulationEvidence> {
    const fixtureAdapter = new LocalFixtureSimulationAdapter(this.blockNumber, this.baseFee);
    const res = await fixtureAdapter.simulate(canonicalTx);
    return {
      ...res,
      status: res.status === 'REVERTED' ? 'REVERTED' : 'FIXTURE_SIMULATION',
      provenance: 'LOCAL_FIXTURE',
    };
  }
}

export interface LiveRPCSimulationProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export interface LiveRPCSimulationConfig {
  rpcProvider?: LiveRPCSimulationProvider;
  rpcUrl?: string;
  fetchFn?: typeof fetch;
  blockNumber?: number;
  timeoutMs?: number;
}

/**
 * Live EVM RPC simulation adapter.
 * Honestly executes eth_call against a real RPC provider or JSON-RPC endpoint.
 * Emits LIVE_BACKEND provenance ONLY upon a successful RPC response or confirmed revert.
 * Fails closed to UNAVAILABLE with provenance NONE on any RPC error, malformed payload, timeout, or missing configuration.
 * Never fabricates block numbers, gas values, state context, or asset balance changes.
 */
export class LiveRPCSimulationAdapter implements SimulationAdapter {
  constructor(private readonly config: LiveRPCSimulationConfig = {}) {}

  private async makeRpcRequest<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const timeoutMs = this.config.timeoutMs ?? 5000;

    if (this.config.rpcProvider) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`RPC provider request timed out after ${timeoutMs}ms`)), timeoutMs);
      });

      try {
        const res = await Promise.race([
          this.config.rpcProvider.request({ method, params }),
          timeoutPromise,
        ]);
        if (res && typeof res === 'object' && 'error' in res && (res as { error: unknown }).error) {
          const rpcErr = (res as { error: { message?: string; code?: number; data?: unknown } }).error;
          const err = new Error(rpcErr.message || 'RPC Provider Error');
          (err as { code?: number }).code = rpcErr.code;
          (err as { data?: unknown }).data = rpcErr.data;
          throw err;
        }
        return res as T;
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
    }

    if (this.config.rpcUrl) {
      const fetchFn = this.config.fetchFn ?? globalThis.fetch;
      if (!fetchFn) {
        throw new Error('fetch is not available in current execution environment');
      }

      const response = await fetchFn(this.config.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as {
        result?: T;
        error?: { code?: number; message?: string; data?: unknown };
      };

      if (json.error) {
        const err = new Error(json.error.message || 'RPC Error');
        (err as { code?: number }).code = json.error.code;
        (err as { data?: unknown }).data = json.error.data;
        throw err;
      }

      if (json.result === undefined) {
        throw new Error('Malformed JSON-RPC response: missing result or error property');
      }

      return json.result;
    }

    throw new Error('No live EVM simulation backend (RPC provider or URL) is configured.');
  }

  private parseRevertError(err: unknown): { isRevert: boolean; reason: string } {
    if (!err) return { isRevert: false, reason: '' };

    const message =
      typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : String(err);

    const rawData =
      typeof err === 'object' && err !== null && 'data' in err ? (err as { data: unknown }).data : undefined;
    const nested =
      rawData && typeof rawData === 'object' ? (rawData as { code?: unknown; data?: unknown }) : undefined;
    const data =
      typeof rawData === 'string' ? rawData : typeof nested?.data === 'string' ? nested.data : '';

    const code =
      typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'number'
        ? (err as { code: number }).code
        : undefined;

    const hasRevertSelector = data.startsWith('0x08c379a0') || data.startsWith('0x4e487b71');
    const isRevertCode = code === 3 || nested?.code === 3;
    const hasRevertMessage = /execution reverted/i.test(message);

    if (hasRevertSelector || isRevertCode || hasRevertMessage) {
      let revertReason = message;
      // Decode standard Error(string) selector: 0x08c379a0
      if (data.startsWith('0x08c379a0') && data.length >= 138) {
        try {
          const strLenHex = data.slice(74, 138);
          const strLen = parseInt(strLenHex, 16);
          if (!isNaN(strLen) && strLen > 0) {
            const strHex = data.slice(138, 138 + strLen * 2);
            const decoded = Buffer.from(strHex, 'hex').toString('utf8');
            if (decoded) {
              revertReason = `Execution reverted: ${decoded}`;
            }
          }
        } catch {
          // ignore decode error and keep message
        }
      }
      return { isRevert: true, reason: revertReason };
    }

    return { isRevert: false, reason: message };
  }

  async simulate(canonicalTx: CanonicalTransactionRequest): Promise<SimulationEvidence> {
    if (!this.config.rpcProvider && !this.config.rpcUrl) {
      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        blockNumber: null,
        stateContext: null,
        success: false,
        gasUsed: null,
        assetChanges: [],
        revertReason: 'No live EVM simulation backend (RPC provider or URL) is configured.',
        disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
      };
    }

    let blockNumber: number | null = null;
    if (typeof this.config.blockNumber === 'number') {
      if (!Number.isInteger(this.config.blockNumber) || this.config.blockNumber < 0) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          blockNumber: null,
          stateContext: null,
          success: false,
          gasUsed: null,
          assetChanges: [],
          revertReason: `RPC simulation call failed: invalid configured blockNumber ${this.config.blockNumber}`,
          disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
        };
      }
      blockNumber = this.config.blockNumber;
    } else {
      try {
        const rawBlock = await this.makeRpcRequest<unknown>('eth_blockNumber', []);
        if (typeof rawBlock === 'string' && rawBlock.startsWith('0x')) {
          const parsed = Number(BigInt(rawBlock));
          if (!Number.isNaN(parsed) && parsed >= 0) {
            blockNumber = parsed;
          }
        } else if (typeof rawBlock === 'number' && !Number.isNaN(rawBlock) && rawBlock >= 0) {
          blockNumber = rawBlock;
        }
        if (blockNumber === null) {
          return {
            status: 'UNAVAILABLE',
            provenance: 'NONE',
            blockNumber: null,
            stateContext: null,
            success: false,
            gasUsed: null,
            assetChanges: [],
            revertReason: 'Malformed RPC response: eth_blockNumber returned malformed or non-numeric block number',
            disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
          };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          blockNumber: null,
          stateContext: null,
          success: false,
          gasUsed: null,
          assetChanges: [],
          revertReason: `RPC simulation call failed: eth_blockNumber query failed: ${message}`,
          disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
        };
      }
    }

    // Verify RPC backend chainId matches canonical transaction chainId
    try {
      const rawChainId = await this.makeRpcRequest<unknown>('eth_chainId', []);
      const backendChainId =
        typeof rawChainId === 'string' && rawChainId.startsWith('0x')
          ? Number(BigInt(rawChainId))
          : typeof rawChainId === 'number'
            ? rawChainId
            : null;
      if (backendChainId === null) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          blockNumber: null,
          stateContext: null,
          success: false,
          gasUsed: null,
          assetChanges: [],
          revertReason: 'Malformed RPC response: invalid or missing chainId',
          disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
        };
      }
      if (backendChainId !== canonicalTx.chainId) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          blockNumber: null,
          stateContext: null,
          success: false,
          gasUsed: null,
          assetChanges: [],
          revertReason: `RPC backend chainId (${String(backendChainId)}) does not match transaction chainId (${canonicalTx.chainId})`,
          disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        blockNumber: null,
        stateContext: null,
        success: false,
        gasUsed: null,
        assetChanges: [],
        revertReason: `RPC simulation call failed: ${message}`,
        disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
      };
    }

    // Prepare canonical transaction fields for eth_call
    const callObject: Record<string, unknown> = {
      from: canonicalTx.from,
      to: canonicalTx.to,
      data: canonicalTx.data,
      value: canonicalTx.value,
    };
    if (canonicalTx.gas) callObject.gas = canonicalTx.gas;
    if (canonicalTx.gasPrice) callObject.gasPrice = canonicalTx.gasPrice;
    if (canonicalTx.maxFeePerGas) callObject.maxFeePerGas = canonicalTx.maxFeePerGas;
    if (canonicalTx.maxPriorityFeePerGas) callObject.maxPriorityFeePerGas = canonicalTx.maxPriorityFeePerGas;
    if (canonicalTx.accessList && canonicalTx.accessList.length > 0) {
      callObject.accessList = canonicalTx.accessList;
    }

    const blockTag = `0x${blockNumber.toString(16)}`;

    try {
      const callResult = await this.makeRpcRequest<unknown>('eth_call', [callObject, blockTag]);

      // eth_call returns a hex string representing the return data (e.g. '0x', '0x00...01')
      if (typeof callResult !== 'string' || !callResult.startsWith('0x')) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          blockNumber: null,
          stateContext: null,
          success: false,
          gasUsed: null,
          assetChanges: [],
          revertReason: `Malformed RPC response: eth_call returned invalid payload (${typeof callResult})`,
          disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
        };
      }

      return {
        status: 'LIVE_SIMULATED',
        provenance: 'LIVE_BACKEND',
        blockNumber,
        stateContext: null,
        success: true,
        gasUsed: null,
        assetChanges: [],
        revertReason: null,
        disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
      };
    } catch (err: unknown) {
      const revertInfo = this.parseRevertError(err);
      if (revertInfo.isRevert) {
        return {
          status: 'REVERTED',
          provenance: 'LIVE_BACKEND',
          blockNumber,
          stateContext: null,
          success: false,
          gasUsed: null,
          assetChanges: [],
          revertReason: revertInfo.reason,
          disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        blockNumber: null,
        stateContext: null,
        success: false,
        gasUsed: null,
        assetChanges: [],
        revertReason: `RPC simulation call failed: ${message}`,
        disclaimer: MANDATORY_SIMULATION_DISCLAIMER,
      };
    }
  }
}


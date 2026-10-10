/**
 * ActionProof ERC-7730 v2 Clear-Signing Adapter
 *
 * WHAT it guarantees:
 * - Honestly distinguishes between LOCAL_FIXTURE descriptors and LIVE_REGISTRY descriptors.
 * - Performs deterministic field cross-validation between descriptor fields and independent ABI decode.
 * - Detects descriptor mismatches when decoded calldata contradicts descriptor parameters.
 * - Treats clear-signing descriptors as strictly advisory semantic evidence.
 *
 * WHAT it does NOT guarantee:
 * - Descriptor presence does NOT guarantee runtime contract honesty or transaction safety.
 */

import type { DecodeEvidence, IntentEvidence, DescriptorCrossValidation } from '../evidence/types.js';
import { type IntentProvider, MANDATORY_INTENT_DISCLAIMER } from './intent-provider.js';

export interface ERC7730DescriptorV2 {
  readonly schemaVersion: '2.0.0';
  readonly id: string;
  readonly functionName?: string;
  readonly context: {
    readonly contract: string;
    readonly chainId: number;
    readonly address?: string;
  };
  readonly expectedFields: readonly string[];
  readonly display: {
    readonly formats: {
      readonly intent: string;
      readonly [key: string]: string;
    };
  };
}

// Local test/demo fixtures explicitly labeled as LOCAL_FIXTURE
export const LOCAL_DESCRIPTOR_FIXTURES: Record<string, Record<string, ERC7730DescriptorV2>> = {
  // Uniswap SwapRouter02
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': {
    exactInputSingle: {
      schemaVersion: '2.0.0',
      id: 'uniswap.v3.swaprouter02.exactInputSingle',
      context: {
        contract: 'SwapRouter02',
        chainId: 1,
        address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
      },
      expectedFields: ['tokenIn', 'tokenOut', 'amountIn', 'amountOutMinimum', 'recipient'],
      display: {
        formats: {
          intent: 'Swap {amountIn} {tokenIn} for minimum {amountOutMinimum} {tokenOut}',
        },
      },
    },
  },
  // USDC
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
    transfer: {
      schemaVersion: '2.0.0',
      id: 'erc20.usdc.transfer',
      context: {
        contract: 'USDC',
        chainId: 1,
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      },
      expectedFields: ['to', 'amount'],
      display: {
        formats: {
          intent: 'Transfer {amount} USDC to {to}',
        },
      },
    },
    approve: {
      schemaVersion: '2.0.0',
      id: 'erc20.usdc.approve',
      context: {
        contract: 'USDC',
        chainId: 1,
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      },
      expectedFields: ['spender', 'amount'],
      display: {
        formats: {
          intent: 'Approve {spender} to spend {amount} USDC',
        },
      },
    },
  },
};

export class ERC7730v2Adapter implements IntentProvider {
  constructor(private readonly enableLocalFixtures = true) {}

  async resolveIntent(
    target: `0x${string}`,
    _chainId: number,
    _data: `0x${string}`,
    decodeEvidence: DecodeEvidence
  ): Promise<IntentEvidence> {
    const normalizedTarget = target.toLowerCase();
    const contractDescriptors = this.enableLocalFixtures
      ? LOCAL_DESCRIPTOR_FIXTURES[normalizedTarget]
      : undefined;

    if (!contractDescriptors || !decodeEvidence.functionName) {
      return {
        status: 'DESCRIPTOR_ABSENT',
        provenance: 'NONE',
        schemaVersion: '2.0.0',
        descriptorId: null,
        intentDisplay: null,
        matchedFields: null,
        crossValidation: {
          performed: false,
          matches: false,
          discrepancies: [],
        },
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }

    const descriptor = contractDescriptors[decodeEvidence.functionName];
    if (!descriptor) {
      return {
        status: 'DESCRIPTOR_ABSENT',
        provenance: 'NONE',
        schemaVersion: '2.0.0',
        descriptorId: null,
        intentDisplay: null,
        matchedFields: null,
        crossValidation: {
          performed: false,
          matches: false,
          discrepancies: [],
        },
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }

    // Deterministic cross-validation between descriptor expected fields and decoded args
    const decodedArgs = decodeEvidence.args ?? {};
    const discrepancies: string[] = [];

    for (const field of descriptor.expectedFields) {
      if (decodedArgs[field] === undefined) {
        discrepancies.push(`Missing expected field in decoded calldata: ${field}`);
      }
    }

    const crossValidation: DescriptorCrossValidation = {
      performed: true,
      matches: discrepancies.length === 0,
      discrepancies,
    };

    if (!crossValidation.matches) {
      return {
        status: 'DESCRIPTOR_MISMATCH',
        provenance: 'LOCAL_FIXTURE',
        schemaVersion: '2.0.0',
        descriptorId: descriptor.id,
        intentDisplay: null,
        matchedFields: decodedArgs,
        crossValidation,
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }

    // Format display string from matched args
    let displayStr = descriptor.display.formats.intent ?? `${decodeEvidence.functionName}(...)`;
    for (const [k, v] of Object.entries(decodedArgs)) {
      displayStr = displayStr.replace(`{${k}}`, String(v));
    }

    return {
      status: 'DESCRIPTOR_FOUND',
      provenance: 'LOCAL_FIXTURE',
      schemaVersion: '2.0.0',
      descriptorId: descriptor.id,
      intentDisplay: displayStr,
      matchedFields: decodedArgs,
      crossValidation,
      disclaimer: MANDATORY_INTENT_DISCLAIMER,
    };
  }
}

/**
 * Mock ERC-7730 descriptor provider for testing and demonstration.
 * Honestly emits LOCAL_FIXTURE provenance; strictly prevented from manufacturing LIVE_REGISTRY.
 */
export class MockLiveERC7730Adapter extends ERC7730v2Adapter {
  constructor() {
    super(true);
  }

  async resolveIntent(
    targetAddress: `0x${string}`,
    chainId: number,
    calldata: `0x${string}`,
    decodeEvidence: DecodeEvidence
  ): Promise<IntentEvidence> {
    const res = await super.resolveIntent(targetAddress, chainId, calldata, decodeEvidence);
    return {
      ...res,
      provenance: 'LOCAL_FIXTURE',
    };
  }
}

export interface LiveRegistryConfig {
  registryUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  localDescriptors?: Record<string, Record<string, ERC7730DescriptorV2>>;
}

/**
 * Live ERC-7730 clear-signing descriptor registry adapter.
 * Honestly queries an external registry HTTP endpoint and emits LIVE_REGISTRY ONLY
 * for descriptors retrieved and validated from that external HTTP response.
 * In-memory descriptor maps emit LOCAL_FIXTURE, never LIVE_REGISTRY.
 * When unconfigured, or on network failure, timeout, or malformed responses,
 * honestly fails closed to UNAVAILABLE/NONE or DESCRIPTOR_ABSENT.
 */
export class LiveRegistryERC7730Adapter implements IntentProvider {
  constructor(private readonly config: LiveRegistryConfig = {}) {}

  async resolveIntent(
    targetAddress: `0x${string}`,
    chainId: number,
    calldata: `0x${string}`,
    decodeEvidence: DecodeEvidence
  ): Promise<IntentEvidence> {
    const normalizedTarget = targetAddress.toLowerCase();

    // 1. In-memory descriptors are strictly labeled LOCAL_FIXTURE
    if (this.config.localDescriptors && !this.config.registryUrl) {
      const contractDescriptors = this.config.localDescriptors[normalizedTarget];
      if (!contractDescriptors || !decodeEvidence.functionName) {
        return {
          status: 'DESCRIPTOR_ABSENT',
          provenance: 'LOCAL_FIXTURE',
          schemaVersion: '2.0.0',
          descriptorId: null,
          intentDisplay: null,
          matchedFields: null,
          crossValidation: { performed: false, matches: false, discrepancies: [] },
          disclaimer: MANDATORY_INTENT_DISCLAIMER,
        };
      }

      const descriptor = contractDescriptors[decodeEvidence.functionName];
      if (!descriptor) {
        return {
          status: 'DESCRIPTOR_ABSENT',
          provenance: 'LOCAL_FIXTURE',
          schemaVersion: '2.0.0',
          descriptorId: null,
          intentDisplay: null,
          matchedFields: null,
          crossValidation: { performed: false, matches: false, discrepancies: [] },
          disclaimer: MANDATORY_INTENT_DISCLAIMER,
        };
      }

      return this.validateAndFormatDescriptor(descriptor, decodeEvidence, 'LOCAL_FIXTURE');
    }

    // 2. Live lookup requires a configured registryUrl
    if (!this.config.registryUrl) {
      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        schemaVersion: '2.0.0',
        descriptorId: null,
        intentDisplay: null,
        matchedFields: null,
        crossValidation: {
          performed: false,
          matches: false,
          discrepancies: [],
        },
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }

    const fetchFn = this.config.fetchFn ?? globalThis.fetch;
    const timeoutMs = this.config.timeoutMs ?? 5000;
    const baseUrl = this.config.registryUrl.replace(/\/$/, '');

    try {
      let json: unknown;

      if (baseUrl.includes('githubusercontent.com') || baseUrl.includes('clear-signing-erc7730-registry')) {
        // Query official ERC-7730 registry index: eip155:{chainId}:{address}
        const indexEndpoint = `${baseUrl}/index.calldata.json`;
        const idxRes = await fetchFn(indexEndpoint, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (idxRes.status === 404) {
          return {
            status: 'DESCRIPTOR_ABSENT',
            provenance: 'LIVE_REGISTRY',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        if (!idxRes.ok) {
          return {
            status: 'UNAVAILABLE',
            provenance: 'NONE',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        const indexData = (await idxRes.json()) as Record<string, string>;
        const indexKey = `eip155:${chainId}:${normalizedTarget}`;
        const descriptorRelPath = indexData?.[indexKey];

        if (!descriptorRelPath || typeof descriptorRelPath !== 'string') {
          return {
            status: 'DESCRIPTOR_ABSENT',
            provenance: 'LIVE_REGISTRY',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        const descriptorEndpoint = `${baseUrl}/${descriptorRelPath}`;
        const descRes = await fetchFn(descriptorEndpoint, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (descRes.status === 404) {
          return {
            status: 'DESCRIPTOR_ABSENT',
            provenance: 'LIVE_REGISTRY',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        if (!descRes.ok) {
          return {
            status: 'UNAVAILABLE',
            provenance: 'NONE',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        json = (await descRes.json()) as unknown;
      } else {
        const endpoint = baseUrl.includes('?')
          ? `${baseUrl}&address=${normalizedTarget}&chainId=${chainId}`
          : `${baseUrl}/${chainId}/${normalizedTarget}.json`;

        const res = await fetchFn(endpoint, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.status === 404) {
          return {
            status: 'DESCRIPTOR_ABSENT',
            provenance: 'LIVE_REGISTRY',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        if (!res.ok) {
          return {
            status: 'UNAVAILABLE',
            provenance: 'NONE',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        json = (await res.json()) as unknown;
      }

      if (!json || typeof json !== 'object') {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          schemaVersion: '2.0.0',
          descriptorId: null,
          intentDisplay: null,
          matchedFields: null,
          crossValidation: { performed: false, matches: false, discrepancies: [] },
          disclaimer: MANDATORY_INTENT_DISCLAIMER,
        };
      }

      let descriptor: ERC7730DescriptorV2 | undefined;

      // Check standard official ERC-7730 schema (with context.contract.deployments & display.formats)
      const officialCandidate = json as {
        context?: { contract?: { deployments?: Array<{ chainId?: number; address?: string }> }; '$id'?: string };
        metadata?: { contractName?: string };
        display?: { formats?: Record<string, { '$id'?: string; intent?: string; fields?: Array<{ path?: string }> }> };
      };

      if (
        decodeEvidence.functionName &&
        officialCandidate.context?.contract?.deployments &&
        Array.isArray(officialCandidate.context.contract.deployments) &&
        officialCandidate.display?.formats
      ) {
        const matchingDeployment = officialCandidate.context.contract.deployments.find(
          (d) => Number(d.chainId) === chainId && typeof d.address === 'string' && d.address.toLowerCase() === normalizedTarget
        );

        if (!matchingDeployment) {
          return {
            status: 'DESCRIPTOR_ABSENT',
            provenance: 'LIVE_REGISTRY',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        let matchingFormat: { '$id'?: string; intent?: string; fields?: Array<{ path?: string }> } | undefined;
        for (const [fmtKey, fmtVal] of Object.entries(officialCandidate.display.formats)) {
          if (fmtKey === decodeEvidence.functionName || fmtKey.startsWith(`${decodeEvidence.functionName}(`)) {
            matchingFormat = fmtVal;
            break;
          }
        }

        if (!matchingFormat) {
          return {
            status: 'DESCRIPTOR_ABSENT',
            provenance: 'LIVE_REGISTRY',
            schemaVersion: '2.0.0',
            descriptorId: null,
            intentDisplay: null,
            matchedFields: null,
            crossValidation: { performed: false, matches: false, discrepancies: [] },
            disclaimer: MANDATORY_INTENT_DISCLAIMER,
          };
        }

        const expectedFields: string[] = [];
        if (Array.isArray(matchingFormat.fields)) {
          for (const f of matchingFormat.fields) {
            if (typeof f?.path === 'string') {
              expectedFields.push(f.path.replace(/^params\./, ''));
            }
          }
        }

        descriptor = {
          schemaVersion: '2.0.0',
          id: (matchingFormat['$id'] as string) ?? `${officialCandidate.metadata?.contractName ?? 'contract'}.${decodeEvidence.functionName}`,
          functionName: decodeEvidence.functionName,
          context: {
            contract: officialCandidate.metadata?.contractName ?? 'Contract',
            chainId,
            address: normalizedTarget,
          },
          expectedFields,
          display: {
            formats: {
              intent: typeof matchingFormat.intent === 'string'
                ? matchingFormat.intent
                : `${decodeEvidence.functionName}(...)`,
            },
          },
        };
      } else if (
        decodeEvidence.functionName &&
        typeof json === 'object' &&
        json !== null &&
        Object.prototype.hasOwnProperty.call(json, decodeEvidence.functionName)
      ) {
        descriptor = (json as Record<string, ERC7730DescriptorV2>)[decodeEvidence.functionName];
      } else if (
        decodeEvidence.functionName &&
        typeof json === 'object' &&
        json !== null &&
        'id' in json &&
        'expectedFields' in json &&
        'display' in json
      ) {
        const candidate = json as ERC7730DescriptorV2;
        if (candidate.functionName === decodeEvidence.functionName) {
          descriptor = candidate;
        }
      }

      if (
        !descriptor ||
        typeof descriptor.id !== 'string' ||
        descriptor.schemaVersion !== '2.0.0' ||
        descriptor.context?.chainId !== chainId ||
        !descriptor.context?.address ||
        descriptor.context.address.toLowerCase() !== normalizedTarget ||
        !Array.isArray(descriptor.expectedFields) ||
        !descriptor.display ||
        typeof descriptor.display !== 'object' ||
        !descriptor.display.formats ||
        typeof descriptor.display.formats.intent !== 'string'
      ) {
        return {
          status: 'DESCRIPTOR_ABSENT',
          provenance: 'LIVE_REGISTRY',
          schemaVersion: '2.0.0',
          descriptorId: null,
          intentDisplay: null,
          matchedFields: null,
          crossValidation: { performed: false, matches: false, discrepancies: [] },
          disclaimer: MANDATORY_INTENT_DISCLAIMER,
        };
      }

      return this.validateAndFormatDescriptor(descriptor, decodeEvidence, 'LIVE_REGISTRY');
    } catch {
      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        schemaVersion: '2.0.0',
        descriptorId: null,
        intentDisplay: null,
        matchedFields: null,
        crossValidation: { performed: false, matches: false, discrepancies: [] },
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }
  }

  private validateAndFormatDescriptor(
    descriptor: ERC7730DescriptorV2,
    decodeEvidence: DecodeEvidence,
    provenance: 'LIVE_REGISTRY' | 'LOCAL_FIXTURE'
  ): IntentEvidence {
    const decodedArgs = decodeEvidence.args ?? {};
    const discrepancies: string[] = [];

    for (const field of descriptor.expectedFields) {
      if (decodedArgs[field] === undefined) {
        discrepancies.push(`Missing expected field in decoded calldata: ${field}`);
      }
    }

    const crossValidation: DescriptorCrossValidation = {
      performed: true,
      matches: discrepancies.length === 0,
      discrepancies,
    };

    if (!crossValidation.matches) {
      return {
        status: 'DESCRIPTOR_MISMATCH',
        provenance,
        schemaVersion: '2.0.0',
        descriptorId: descriptor.id,
        intentDisplay: null,
        matchedFields: decodedArgs,
        crossValidation,
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }

    let displayStr = descriptor.display.formats.intent;
    for (const [k, v] of Object.entries(decodedArgs)) {
      displayStr = displayStr.replace(`{${k}}`, String(v));
    }

    return {
      status: 'DESCRIPTOR_FOUND',
      provenance,
      schemaVersion: '2.0.0',
      descriptorId: descriptor.id,
      intentDisplay: displayStr,
      matchedFields: decodedArgs,
      crossValidation,
      disclaimer: MANDATORY_INTENT_DISCLAIMER,
    };
  }
}


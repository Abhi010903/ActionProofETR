/**
 * ActionProof Contract Identity Evidence Adapter
 *
 * WHAT it guarantees:
 * - Queries contract verification status (e.g. Sourcify source/bytecode correspondence).
 * - Honestly distinguishes between LIVE_EXTERNAL evidence and LOCAL_FIXTURE evidence.
 * - Categorizes correspondence as FULL_MATCH, PARTIAL_MATCH, UNVERIFIED, or UNAVAILABLE.
 * - Always includes explicit disclaimer that source verification is NOT a proof of contract safety.
 *
 * WHAT it does NOT guarantee:
 * - Source/bytecode verification does NOT guarantee that contract logic is free from vulnerabilities.
 */

import type { ContractEvidence } from '../evidence/types.js';

export interface ContractEvidenceProvider {
  getContractEvidence(address: `0x${string}`, chainId: number): Promise<ContractEvidence>;
}

export const MANDATORY_CONTRACT_DISCLAIMER =
  'Sourcify verified source/bytecode correspondence evidence. Does NOT establish contract safety.';

export interface ContractFixtureDetail {
  readonly name: string;
  readonly compiler: string;
  readonly matchType: 'FULL_MATCH' | 'PARTIAL_MATCH';
  readonly decimals?: number;
}

// Explicitly documented local fixtures for deterministic offline testing and demo
export const KNOWN_CONTRACT_FIXTURES: Record<string, ContractFixtureDetail> = {
  // Uniswap V3 SwapRouter02
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': {
    name: 'SwapRouter02',
    compiler: 'v0.7.6+commit.7338295f',
    matchType: 'FULL_MATCH',
  },
  // USDC contract (6 decimals)
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
    name: 'FiatTokenV2_2',
    compiler: 'v0.6.12+commit.27d51765',
    matchType: 'FULL_MATCH',
    decimals: 6,
  },
  // WETH9 (18 decimals)
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': {
    name: 'WETH9',
    compiler: 'v0.4.18+commit.9cf6e910',
    matchType: 'FULL_MATCH',
    decimals: 18,
  },
};

/**
 * FACT: Trusted Token Decimals Evidence
 *
 * Only explicit contract fixtures or authenticated registry entries constitute
 * trusted token decimals evidence. Token symbol, name, UI text, or declared intent
 * MUST NEVER be used to infer decimals.
 */
export function getTrustedTokenDecimals(address: string): number | undefined {
  const normalized = address.toLowerCase();
  const fixture = KNOWN_CONTRACT_FIXTURES[normalized];
  if (fixture && typeof fixture.decimals === 'number') {
    return fixture.decimals;
  }
  return undefined;
}

interface SourcifyCheckItem {
  address: string;
  status: 'perfect' | 'partial' | 'false';
  chainIds?: (number | string)[];
}

export class SourcifyContractAdapter implements ContractEvidenceProvider {
  constructor(
    private readonly apiUrl = 'https://sourcify.dev/server',
    private readonly enableLocalFixtures = true
  ) {}

  async getContractEvidence(address: `0x${string}`, chainId: number): Promise<ContractEvidence> {
    const normalized = address.toLowerCase();

    // 1. Explicitly labeled local test fixture
    if (this.enableLocalFixtures && KNOWN_CONTRACT_FIXTURES[normalized]) {
      const fixture = KNOWN_CONTRACT_FIXTURES[normalized];
      return {
        status: 'VERIFIED_CORRESPONDENCE',
        provenance: 'LOCAL_FIXTURE',
        sourceDescription: 'verified source/bytecode correspondence fixture',
        address,
        matchType: fixture.matchType,
        contractName: fixture.name,
        compiler: fixture.compiler,
        disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        decimals: fixture.decimals ?? null,
      };
    }

    // 2. Attempt live Sourcify lookup if network is available
    try {
      const baseUrl = this.apiUrl.replace(/\/$/, '');
      const endpoint = baseUrl.includes('/v2')
        ? `${baseUrl}/contract/${chainId}/${normalized}?fields=abi,metadata`
        : `${baseUrl}/v2/contract/${chainId}/${normalized}?fields=abi,metadata`;

      const res = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ActionProof/1.0.0 (https://actionproof-etr.pages.dev)',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (res.status === 404) {
        try {
          const errData = (await res.json()) as Record<string, unknown>;
          if (
            errData &&
            errData.match === null &&
            typeof errData.address === 'string' &&
            errData.address.toLowerCase() === normalized
          ) {
            return {
              status: 'UNVERIFIED',
              provenance: 'LIVE_EXTERNAL',
              sourceDescription: 'Sourcify live lookup confirmed: contract source code is unverified',
              address,
              matchType: 'NONE',
              contractName: null,
              compiler: null,
              disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
              abi: null,
            };
          }
        } catch {
          // not structured unverified JSON
        }
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          sourceDescription: `Sourcify verification service returned HTTP error ${res.status}`,
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      if (!res.ok) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          sourceDescription: `Sourcify verification service returned HTTP error ${res.status}`,
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const matchStatus = data.match ?? data.runtimeMatch;

      const isFull = matchStatus === 'exact_match' || matchStatus === 'perfect';
      const isPartial = matchStatus === 'match' || matchStatus === 'partial';

      if (isFull || isPartial) {
        let contractName: string | null = null;
        const metadata = data.metadata as { settings?: { compilationTarget?: Record<string, string> }; compiler?: { version?: string } } | undefined;
        if (metadata?.settings?.compilationTarget) {
          const targets = Object.values(metadata.settings.compilationTarget);
          if (targets.length > 0 && typeof targets[0] === 'string') {
            contractName = targets[0];
          }
        }
        const compiler = (typeof data.compilerVersion === 'string' ? data.compilerVersion : metadata?.compiler?.version) ?? null;
        const abi = Array.isArray(data.abi) ? data.abi : null;

        return {
          status: 'VERIFIED_CORRESPONDENCE',
          provenance: 'LIVE_EXTERNAL',
          sourceDescription: isFull
            ? 'verified source/bytecode correspondence from Sourcify (exact match)'
            : 'verified partial source/bytecode correspondence from Sourcify (match)',
          address,
          matchType: isFull ? 'FULL_MATCH' : 'PARTIAL_MATCH',
          contractName,
          compiler,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          abi,
        };
      }

      if (matchStatus === null || matchStatus === 'false') {
        return {
          status: 'UNVERIFIED',
          provenance: 'LIVE_EXTERNAL',
          sourceDescription: 'unverified contract on Sourcify',
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        sourceDescription: `Sourcify verification service returned unrecognized status '${String(matchStatus)}'`,
        address,
        matchType: 'NONE',
        contractName: null,
        compiler: null,
        disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
      };
    } catch {
      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        sourceDescription: 'Sourcify verification service unavailable (network timeout/failure)',
        address,
        matchType: 'NONE',
        contractName: null,
        compiler: null,
        disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
      };
    }
  }
}

/**
 * Mock contract evidence provider for testing and demonstration.
 * Honestly emits LOCAL_FIXTURE provenance; strictly prevented from manufacturing LIVE_EXTERNAL.
 */
export class MockLiveContractAdapter implements ContractEvidenceProvider {
  constructor(private readonly fixtures = KNOWN_CONTRACT_FIXTURES) {}

  async getContractEvidence(address: `0x${string}`, _chainId: number): Promise<ContractEvidence> {
    const normalized = address.toLowerCase();
    const fixture = this.fixtures[normalized];
    if (fixture) {
      return {
        status: 'VERIFIED_CORRESPONDENCE',
        provenance: 'LOCAL_FIXTURE',
        sourceDescription: 'verified source/bytecode correspondence fixture (local mock fixture)',
        address,
        matchType: fixture.matchType,
        contractName: fixture.name,
        compiler: fixture.compiler,
        disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        decimals: fixture.decimals ?? null,
      };
    }
    return {
      status: 'UNVERIFIED',
      provenance: 'NONE',
      sourceDescription: 'Sourcify fixture lookup: contract source code not found in fixture set',
      address,
      matchType: 'NONE',
      contractName: null,
      compiler: null,
      disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
    };
  }
}

export interface LiveSourcifyConfig {
  apiUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  localFixtures?: Record<string, ContractFixtureDetail>;
}

/**
 * Live Sourcify contract evidence provider.
 * Queries live Sourcify correspondence and emits LIVE_EXTERNAL provenance ONLY
 * after receiving and validating a genuine HTTP response from the Sourcify API.
 * Never labels in-memory fixtures as LIVE_EXTERNAL. If localFixtures are provided
 * and matched, honestly emits LOCAL_FIXTURE.
 * Fails closed to UNAVAILABLE/NONE on missing configuration, network error, timeout, or malformed response.
 */
export class LiveSourcifyContractAdapter implements ContractEvidenceProvider {
  constructor(private readonly config: LiveSourcifyConfig = {}) {}

  async getContractEvidence(address: `0x${string}`, chainId: number): Promise<ContractEvidence> {
    const normalized = address.toLowerCase() as `0x${string}`;

    // If local fixtures are configured and hit, honestly emit LOCAL_FIXTURE, NEVER LIVE_EXTERNAL
    if (this.config.localFixtures) {
      const fixture = this.config.localFixtures[normalized];
      if (fixture) {
        return {
          status: 'VERIFIED_CORRESPONDENCE',
          provenance: 'LOCAL_FIXTURE',
          sourceDescription: 'Sourcify local fixture match (local fixture fallback)',
          address,
          matchType: fixture.matchType,
          contractName: fixture.name,
          compiler: fixture.compiler,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          decimals: fixture.decimals ?? null,
        };
      }
    }

    // Live lookup requires an explicit API URL or injectable fetch function
    if (!this.config.apiUrl && !this.config.fetchFn) {
      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        sourceDescription: 'No Sourcify API URL or fetch function configured for live contract verification',
        address,
        matchType: 'NONE',
        contractName: null,
        compiler: null,
        disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
      };
    }

    const apiUrl = (this.config.apiUrl ?? 'https://sourcify.dev/server').replace(/\/$/, '');
    const fetchFn = this.config.fetchFn ?? globalThis.fetch;
    const timeoutMs = this.config.timeoutMs ?? 5000;
    const endpoint = apiUrl.includes('/v2')
      ? `${apiUrl}/contract/${chainId}/${normalized}?fields=abi,metadata`
      : `${apiUrl}/v2/contract/${chainId}/${normalized}?fields=abi,metadata`;

    try {
      const res = await fetchFn(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ActionProof/1.0.0 (https://actionproof-etr.pages.dev)',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 404) {
        try {
          const errData = (await res.json()) as Record<string, unknown>;
          if (
            errData &&
            typeof errData === 'object' &&
            errData.match === null &&
            typeof errData.address === 'string' &&
            errData.address.toLowerCase() === normalized &&
            (errData.chainId === undefined || Number(errData.chainId) === chainId)
          ) {
            return {
              status: 'UNVERIFIED',
              provenance: 'LIVE_EXTERNAL',
              sourceDescription: 'Sourcify live lookup confirmed: contract source code is unverified',
              address,
              matchType: 'NONE',
              contractName: null,
              compiler: null,
              disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
              abi: null,
            };
          }
        } catch {
          // not structured unverified JSON
        }
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          sourceDescription: `Sourcify live lookup failed: HTTP error ${res.status}`,
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      if (!res.ok) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          sourceDescription: `Sourcify live lookup failed: HTTP error ${res.status}`,
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      const json = (await res.json()) as unknown;
      if (!json || (typeof json !== 'object' && !Array.isArray(json))) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          sourceDescription: 'Sourcify live lookup failed: response is not a valid object or array of check results',
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      // Handle Sourcify v2 object response
      if (!Array.isArray(json)) {
        const v2 = json as Record<string, unknown>;
        if (!('address' in v2) || typeof v2.address !== 'string' || v2.address.toLowerCase() !== normalized) {
          return {
            status: 'UNAVAILABLE',
            provenance: 'NONE',
            sourceDescription: 'Sourcify live lookup failed: response does not contain a record for requested address',
            address,
            matchType: 'NONE',
            contractName: null,
            compiler: null,
            disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          };
        }

        if ('chainId' in v2) {
          const parsedChainId = typeof v2.chainId === 'number' ? v2.chainId : parseInt(String(v2.chainId), 10);
          if (isNaN(parsedChainId) || parsedChainId !== chainId) {
            return {
              status: 'UNAVAILABLE',
              provenance: 'NONE',
              sourceDescription: `Sourcify live lookup failed: response chainId ${String(v2.chainId)} does not match requested chainId ${chainId}`,
              address,
              matchType: 'NONE',
              contractName: null,
              compiler: null,
              disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
            };
          }
        }

        if (v2.match === null || v2.status === 'false') {
          return {
            status: 'UNVERIFIED',
            provenance: 'LIVE_EXTERNAL',
            sourceDescription: 'Sourcify live lookup confirmed: contract source code is unverified',
            address,
            matchType: 'NONE',
            contractName: null,
            compiler: null,
            disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
            abi: null,
          };
        }

        const matchStatus = v2.match ?? v2.runtimeMatch ?? v2.status;
        const isFull = matchStatus === 'exact_match' || matchStatus === 'perfect';
        const isPartial = matchStatus === 'match' || matchStatus === 'partial';

        if (!isFull && !isPartial) {
          return {
            status: 'UNAVAILABLE',
            provenance: 'NONE',
            sourceDescription: `Sourcify live lookup failed: unrecognized verification status '${String(matchStatus)}'`,
            address,
            matchType: 'NONE',
            contractName: null,
            compiler: null,
            disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          };
        }

        let contractName: string | null = null;
        const metadata = v2.metadata as { settings?: { compilationTarget?: Record<string, string> }; compiler?: { version?: string } } | undefined;
        if (metadata?.settings?.compilationTarget && typeof metadata.settings.compilationTarget === 'object') {
          const targets = Object.values(metadata.settings.compilationTarget);
          if (targets.length > 0 && typeof targets[0] === 'string') {
            contractName = targets[0];
          }
        }
        if (!contractName && typeof v2.name === 'string') contractName = v2.name;
        if (!contractName && typeof v2.contractName === 'string') contractName = v2.contractName;

        const compiler = (typeof v2.compilerVersion === 'string' ? v2.compilerVersion : metadata?.compiler?.version) ?? null;
        const abi = Array.isArray(v2.abi) ? v2.abi : null;

        return {
          status: 'VERIFIED_CORRESPONDENCE',
          provenance: 'LIVE_EXTERNAL',
          sourceDescription: isFull
            ? 'Sourcify live verified source/bytecode correspondence (perfect match)'
            : 'Sourcify live verified source/bytecode correspondence (partial match)',
          address,
          matchType: isFull ? 'FULL_MATCH' : 'PARTIAL_MATCH',
          contractName,
          compiler,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          decimals: null,
          abi,
        };
      }

      // Handle Legacy array format
      if (json.length === 0) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          sourceDescription: 'Sourcify live lookup failed: response is not a valid array of check results',
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      const match = json.find(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          'address' in item &&
          typeof (item as { address: unknown }).address === 'string' &&
          (item as { address: string }).address.toLowerCase() === normalized
      ) as { address: string; status: unknown; chainIds?: unknown } | undefined;

      if (!match) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          sourceDescription: 'Sourcify live lookup failed: response does not contain a record for requested address',
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      // If chainIds is provided in the response record, validate against requested chainId
      if (match.chainIds !== undefined) {
        if (!Array.isArray(match.chainIds)) {
          return {
            status: 'UNAVAILABLE',
            provenance: 'NONE',
            sourceDescription: 'Sourcify live lookup failed: malformed chainIds property in response record',
            address,
            matchType: 'NONE',
            contractName: null,
            compiler: null,
            disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          };
        }

        const parsedChainIds: number[] = [];
        for (const item of match.chainIds) {
          let parsed: number | null = null;
          if (typeof item === 'number' && Number.isInteger(item) && item > 0) {
            parsed = item;
          } else if (typeof item === 'string' && /^\d+$/.test(item.trim())) {
            parsed = parseInt(item.trim(), 10);
          }
          if (parsed === null) {
            return {
              status: 'UNAVAILABLE',
              provenance: 'NONE',
              sourceDescription: 'Sourcify live lookup failed: malformed chain ID in response chainIds array',
              address,
              matchType: 'NONE',
              contractName: null,
              compiler: null,
              disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
            };
          }
          parsedChainIds.push(parsed);
        }

        if (parsedChainIds.length === 0 || !parsedChainIds.includes(chainId)) {
          return {
            status: 'UNAVAILABLE',
            provenance: 'NONE',
            sourceDescription: `Sourcify live lookup failed: response chainIds [${parsedChainIds.join(', ')}] do not include requested chainId ${chainId}`,
            address,
            matchType: 'NONE',
            contractName: null,
            compiler: null,
            disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          };
        }
      }

      if (match.status === 'false') {
        return {
          status: 'UNVERIFIED',
          provenance: 'LIVE_EXTERNAL',
          sourceDescription: 'Sourcify live lookup confirmed: contract source code is unverified',
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      if (match.status === 'perfect') {
        return {
          status: 'VERIFIED_CORRESPONDENCE',
          provenance: 'LIVE_EXTERNAL',
          sourceDescription: 'Sourcify live verified source/bytecode correspondence (perfect match)',
          address,
          matchType: 'FULL_MATCH',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          decimals: null,
        };
      }

      if (match.status === 'partial') {
        return {
          status: 'VERIFIED_CORRESPONDENCE',
          provenance: 'LIVE_EXTERNAL',
          sourceDescription: 'Sourcify live verified source/bytecode correspondence (partial match)',
          address,
          matchType: 'PARTIAL_MATCH',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
          decimals: null,
        };
      }

      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        sourceDescription: `Sourcify live lookup failed: unrecognized verification status '${String(match.status)}'`,
        address,
        matchType: 'NONE',
        contractName: null,
        compiler: null,
        disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'UNAVAILABLE',
        provenance: 'NONE',
        sourceDescription: `Sourcify live lookup failed: ${message}`,
        address,
        matchType: 'NONE',
        contractName: null,
        compiler: null,
        disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
      };
    }
  }
}


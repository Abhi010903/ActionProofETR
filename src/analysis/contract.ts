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
      const res = await fetch(`${this.apiUrl}/check-by-addresses?addresses=${normalized}&chainIds=${chainId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(2000),
      });

      if (!res.ok) {
        return {
          status: 'UNAVAILABLE',
          provenance: 'NONE',
          sourceDescription: 'Sourcify verification service returned HTTP error',
          address,
          matchType: 'NONE',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      const data = (await res.json()) as SourcifyCheckItem[];
      const match = data?.[0];

      if (match?.status === 'perfect') {
        return {
          status: 'VERIFIED_CORRESPONDENCE',
          provenance: 'LIVE_EXTERNAL',
          sourceDescription: 'verified source/bytecode correspondence from Sourcify',
          address,
          matchType: 'FULL_MATCH',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      } else if (match?.status === 'partial') {
        return {
          status: 'VERIFIED_CORRESPONDENCE',
          provenance: 'LIVE_EXTERNAL',
          sourceDescription: 'verified partial source/bytecode correspondence from Sourcify',
          address,
          matchType: 'PARTIAL_MATCH',
          contractName: null,
          compiler: null,
          disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
        };
      }

      return {
        status: 'UNVERIFIED',
        provenance: 'NONE',
        sourceDescription: 'unverified contract on Sourcify',
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
    const endpoint = `${apiUrl}/check-by-addresses?addresses=${normalized}&chainIds=${chainId}`;

    try {
      const res = await fetchFn(endpoint, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });

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
      if (!Array.isArray(json) || json.length === 0) {
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


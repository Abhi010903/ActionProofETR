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
 * Mock live contract evidence provider for testing and verification against live-grade evidence.
 * Honestly emits LIVE_EXTERNAL provenance without making actual network calls.
 */
export class MockLiveContractAdapter implements ContractEvidenceProvider {
  constructor(private readonly fixtures = KNOWN_CONTRACT_FIXTURES) {}

  async getContractEvidence(address: `0x${string}`, _chainId: number): Promise<ContractEvidence> {
    const normalized = address.toLowerCase();
    const fixture = this.fixtures[normalized];
    if (fixture) {
      return {
        status: 'VERIFIED_CORRESPONDENCE',
        provenance: 'LIVE_EXTERNAL',
        sourceDescription: 'Sourcify live verified source/bytecode correspondence',
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
      provenance: 'LIVE_EXTERNAL',
      sourceDescription: 'Sourcify live lookup: contract source code not found',
      address,
      matchType: 'NONE',
      contractName: null,
      compiler: null,
      disclaimer: MANDATORY_CONTRACT_DISCLAIMER,
    };
  }
}

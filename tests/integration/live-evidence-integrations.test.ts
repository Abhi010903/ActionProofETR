import { describe, it, expect } from 'vitest';
import {
  LiveSourcifyContractAdapter,
  KNOWN_CONTRACT_FIXTURES,
} from '../../src/analysis/contract.js';
import {
  LiveRegistryERC7730Adapter,
  LOCAL_DESCRIPTOR_FIXTURES,
} from '../../src/intent/erc7730.js';
import {
  LiveRPCSimulationAdapter,
} from '../../src/analysis/simulation.js';
import {
  createLiveEvidencePipeline,
  createPublicLiveEvidencePipeline,
  DEFAULT_PUBLIC_ENDPOINTS,
  EvidencePipeline,
} from '../../src/evidence/pipeline.js';
import {
  ActionProofProviderProxy,
  MockWalletProvider,
  type ActionProofResult,
} from '../../src/provider/index.js';
import { computeCommitment } from '../../src/canonical/commitment.js';
import type { CanonicalTransactionRequest } from '../../src/canonical/types.js';
import type { DecodeEvidence } from '../../src/evidence/types.js';

const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
const ATTACKER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;

function createTestCanonicalTx(overrides: Partial<CanonicalTransactionRequest> = {}): CanonicalTransactionRequest {
  return {
    domain: 'actionproof.request.v1',
    type: '0x2',
    from: ATTACKER,
    to: ROUTER,
    value: '0x0',
    data: '0x04e45aaf',
    chainId: 1,
    nonce: null,
    gas: '0x30d40',
    gasPrice: null,
    maxFeePerGas: '0x4a817c800',
    maxPriorityFeePerGas: '0x3b9aca00',
    accessList: [],
    ...overrides,
  };
}

describe('Genuine External Evidence Integrations - Deterministic Tests', () => {
  describe('A. Sourcify Contract Metadata & ABI Integration', () => {
    it('parses Sourcify v2 full match with metadata and ABI', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            match: 'exact_match',
            runtimeMatch: 'exact_match',
            chainId: 1,
            address: ROUTER,
            compilerVersion: '0.7.6+commit.7338295f',
            metadata: {
              settings: {
                compilationTarget: {
                  'contracts/SwapRouter02.sol': 'SwapRouter02',
                },
              },
            },
            abi: [
              { name: 'exactInputSingle', type: 'function', inputs: [] },
              { name: 'exactOutputSingle', type: 'function', inputs: [] },
            ],
          }),
          { status: 200 }
        );

      const adapter = new LiveSourcifyContractAdapter({
        apiUrl: 'https://sourcify.dev/server',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.getContractEvidence(ROUTER, 1);
      expect(res.status).toBe('VERIFIED_CORRESPONDENCE');
      expect(res.provenance).toBe('LIVE_EXTERNAL');
      expect(res.matchType).toBe('FULL_MATCH');
      expect(res.contractName).toBe('SwapRouter02');
      expect(res.compiler).toBe('0.7.6+commit.7338295f');
      expect(res.abi).toBeDefined();
      expect(Array.isArray(res.abi)).toBe(true);
      expect((res.abi as unknown[]).length).toBe(2);
    });

    it('parses Sourcify v2 partial match honestly', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            match: 'partial',
            runtimeMatch: 'partial',
            chainId: 1,
            address: ROUTER,
          }),
          { status: 200 }
        );

      const adapter = new LiveSourcifyContractAdapter({
        apiUrl: 'https://sourcify.dev/server',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.getContractEvidence(ROUTER, 1);
      expect(res.status).toBe('VERIFIED_CORRESPONDENCE');
      expect(res.provenance).toBe('LIVE_EXTERNAL');
      expect(res.matchType).toBe('PARTIAL_MATCH');
    });

    it('parses Sourcify v2 404 unverified contract response as honest UNVERIFIED with LIVE_EXTERNAL', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            match: null,
            creationMatch: null,
            runtimeMatch: null,
            chainId: '1',
            address: ATTACKER,
          }),
          { status: 404 }
        );

      const adapter = new LiveSourcifyContractAdapter({
        apiUrl: 'https://sourcify.dev/server',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.getContractEvidence(ATTACKER, 1);
      expect(res.status).toBe('UNVERIFIED');
      expect(res.provenance).toBe('LIVE_EXTERNAL');
      expect(res.matchType).toBe('NONE');
      expect(res.sourceDescription).toContain('contract source code is unverified');
    });

    it('fails closed to UNAVAILABLE when Sourcify v2 response address does not match requested address', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            match: 'match',
            chainId: 1,
            address: USDC, // Wrong address returned!
          }),
          { status: 200 }
        );

      const adapter = new LiveSourcifyContractAdapter({
        apiUrl: 'https://sourcify.dev/server',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.getContractEvidence(ROUTER, 1);
      expect(res.status).toBe('UNAVAILABLE');
      expect(res.provenance).toBe('NONE');
      expect(res.sourceDescription).toContain('does not contain a record for requested address');
    });

    it('fails closed to UNAVAILABLE when Sourcify v2 response chainId does not match requested chainId', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            match: 'match',
            chainId: 137, // Polygon 137 instead of requested Ethereum 1
            address: ROUTER,
          }),
          { status: 200 }
        );

      const adapter = new LiveSourcifyContractAdapter({
        apiUrl: 'https://sourcify.dev/server',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.getContractEvidence(ROUTER, 1);
      expect(res.status).toBe('UNAVAILABLE');
      expect(res.provenance).toBe('NONE');
      expect(res.sourceDescription).toContain('does not match requested chainId 1');
    });

    it('fails closed to UNAVAILABLE on HTTP 500 error or network timeout', async () => {
      const errorFetch = async () => new Response('Internal Server Error', { status: 500 });
      const adapter = new LiveSourcifyContractAdapter({
        apiUrl: 'https://sourcify.dev/server',
        fetchFn: errorFetch as unknown as typeof fetch,
      });

      const res = await adapter.getContractEvidence(ROUTER, 1);
      expect(res.status).toBe('UNAVAILABLE');
      expect(res.provenance).toBe('NONE');
      expect(res.sourceDescription).toContain('HTTP error 500');
    });

    it('never labels local fixture matches as LIVE_EXTERNAL', async () => {
      const localAdapter = new LiveSourcifyContractAdapter({
        localFixtures: KNOWN_CONTRACT_FIXTURES,
      });

      const res = await localAdapter.getContractEvidence(ROUTER, 1);
      expect(res.provenance).toBe('LOCAL_FIXTURE');
      expect(res.provenance).not.toBe('LIVE_EXTERNAL');
    });
  });

  describe('B. ERC-7730 Registry Integration', () => {
    const mockDecode: DecodeEvidence = {
      status: 'DECODED',
      functionName: 'exactInputSingle',
      signature: 'exactInputSingle(...)',
      args: {
        tokenIn: USDC,
        tokenOut: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        amountIn: '100000000',
        amountOutMinimum: '50000000000000000',
        recipient: ATTACKER,
      },
      callTree: [],
      detectedApprovals: [],
      hasExactUnlimitedApproval: false,
      hasHighValueApproval: false,
    };

    it('resolves descriptor via official ERC-7730 index and descriptor schema', async () => {
      const mockFetch = async (url: string) => {
        if (url.includes('index.calldata.json')) {
          return new Response(
            JSON.stringify({
              [`eip155:1:${ROUTER.toLowerCase()}`]: 'registry/uniswap/calldata-UniswapV3Router02.json',
            }),
            { status: 200 }
          );
        }
        if (url.includes('calldata-UniswapV3Router02.json')) {
          return new Response(
            JSON.stringify({
              context: {
                contract: {
                  deployments: [{ chainId: 1, address: ROUTER }],
                },
              },
              metadata: { contractName: 'SwapRouter02' },
              display: {
                formats: {
                  'exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params)': {
                    $id: 'uniswap.exactInputSingle',
                    intent: 'swap',
                    fields: [
                      { path: 'params.amountIn' },
                      { path: 'params.amountOutMinimum' },
                      { path: 'params.recipient' },
                    ],
                  },
                },
              },
            }),
            { status: 200 }
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const adapter = new LiveRegistryERC7730Adapter({
        registryUrl: 'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.resolveIntent(ROUTER, 1, '0x04e45aaf', mockDecode);
      expect(res.status).toBe('DESCRIPTOR_FOUND');
      expect(res.provenance).toBe('LIVE_REGISTRY');
      expect(res.crossValidation.matches).toBe(true);
      expect(res.intentDisplay?.toLowerCase()).toContain('swap');
    });

    it('detects parameter discrepancy when calldata does not match descriptor fields', async () => {
      const incompleteDecode: DecodeEvidence = {
        ...mockDecode,
        args: {
          tokenIn: USDC,
          // Missing recipient in args!
        },
      };

      const mockFetch = async (url: string) => {
        if (url.includes('index.calldata.json')) {
          return new Response(
            JSON.stringify({
              [`eip155:1:${ROUTER.toLowerCase()}`]: 'registry/uniswap/calldata.json',
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            context: { contract: { deployments: [{ chainId: 1, address: ROUTER }] } },
            metadata: { contractName: 'SwapRouter02' },
            display: {
              formats: {
                exactInputSingle: {
                  $id: 'uniswap.exactInputSingle',
                  intent: 'swap',
                  fields: [{ path: 'recipient' }],
                },
              },
            },
          }),
          { status: 200 }
        );
      };

      const adapter = new LiveRegistryERC7730Adapter({
        registryUrl: 'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.resolveIntent(ROUTER, 1, '0x04e45aaf', incompleteDecode);
      expect(res.status).toBe('DESCRIPTOR_MISMATCH');
      expect(res.provenance).toBe('LIVE_REGISTRY');
      expect(res.crossValidation.matches).toBe(false);
      expect(res.crossValidation.discrepancies.length).toBeGreaterThan(0);
    });

    it('returns DESCRIPTOR_ABSENT when contract address is not in registry index', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            'eip155:1:0x9999999999999999999999999999999999999999': 'other.json',
          }),
          { status: 200 }
        );

      const adapter = new LiveRegistryERC7730Adapter({
        registryUrl: 'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.resolveIntent(ROUTER, 1, '0x04e45aaf', mockDecode);
      expect(res.status).toBe('DESCRIPTOR_ABSENT');
      expect(res.provenance).toBe('LIVE_REGISTRY');
    });

    it('fails closed to UNAVAILABLE when registry network fails', async () => {
      const failFetch = async () => new Response('Gateway timeout', { status: 504 });
      const adapter = new LiveRegistryERC7730Adapter({
        registryUrl: 'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master',
        fetchFn: failFetch as unknown as typeof fetch,
      });

      const res = await adapter.resolveIntent(ROUTER, 1, '0x04e45aaf', mockDecode);
      expect(res.status).toBe('UNAVAILABLE');
      expect(res.provenance).toBe('NONE');
    });

    it('never labels local in-memory fixtures as LIVE_REGISTRY', async () => {
      const localAdapter = new LiveRegistryERC7730Adapter({
        localDescriptors: LOCAL_DESCRIPTOR_FIXTURES,
      });

      const res = await localAdapter.resolveIntent(ROUTER, 1, '0x04e45aaf', mockDecode);
      expect(res.provenance).toBe('LOCAL_FIXTURE');
      expect(res.provenance).not.toBe('LIVE_REGISTRY');
    });
  });

  describe('C. Ethereum RPC Transaction Simulation Integration', () => {
    it('executes eth_call at resolved eth_blockNumber and returns LIVE_SIMULATED with block context', async () => {
      const mockFetch = async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as { method: string };
        if (body.method === 'eth_blockNumber') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x18f24a0' }), { status: 200 });
        }
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: '0x1' }), { status: 200 });
        }
        if (body.method === 'eth_call') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 3, result: '0x0000000000000000000000000000000000000001' }), { status: 200 });
        }
        return new Response('Method not supported', { status: 400 });
      };

      const adapter = new LiveRPCSimulationAdapter({
        rpcUrl: 'https://rpc.mevblocker.io',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const tx = createTestCanonicalTx();
      const res = await adapter.simulate(tx);
      expect(res.status).toBe('LIVE_SIMULATED');
      expect(res.provenance).toBe('LIVE_BACKEND');
      expect(res.success).toBe(true);
      expect(res.blockNumber).toBe(26158240);
      expect(res.revertReason).toBeNull();
    });

    it('detects EVM execution revert and reports REVERTED with LIVE_BACKEND provenance', async () => {
      const mockFetch = async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as { method: string };
        if (body.method === 'eth_blockNumber') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x18f24a0' }), { status: 200 });
        }
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: '0x1' }), { status: 200 });
        }
        if (body.method === 'eth_call') {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              error: { code: 3, message: 'execution reverted: UniswapV3: STF', data: '0x' },
            }),
            { status: 200 }
          );
        }
        return new Response('Method not supported', { status: 400 });
      };

      const adapter = new LiveRPCSimulationAdapter({
        rpcUrl: 'https://rpc.mevblocker.io',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const tx = createTestCanonicalTx();
      const res = await adapter.simulate(tx);
      expect(res.status).toBe('REVERTED');
      expect(res.provenance).toBe('LIVE_BACKEND');
      expect(res.success).toBe(false);
      expect(res.revertReason).toContain('UniswapV3: STF');
      expect(res.blockNumber).toBe(26158240);
    });

    it('fails closed when backend RPC chainId does not match transaction chainId', async () => {
      const mockFetch = async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as { method: string };
        if (body.method === 'eth_blockNumber') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1000' }), { status: 200 });
        }
        if (body.method === 'eth_chainId') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: '0x89' }), { status: 200 }); // Polygon 137
        }
        return new Response('ok', { status: 200 });
      };

      const adapter = new LiveRPCSimulationAdapter({
        rpcUrl: 'https://rpc.mevblocker.io',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const tx = createTestCanonicalTx({ chainId: 1 });
      const res = await adapter.simulate(tx);
      expect(res.status).toBe('UNAVAILABLE');
      expect(res.provenance).toBe('NONE');
      expect(res.revertReason).toContain('does not match transaction chainId');
    });

    it('fails closed when eth_blockNumber fails without calling eth_call on latest', async () => {
      let ethCallAttempted = false;
      const mockFetch = async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as { method: string };
        if (body.method === 'eth_blockNumber') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Block query unavailable' } }), { status: 200 });
        }
        if (body.method === 'eth_call') {
          ethCallAttempted = true;
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: '0x' }), { status: 200 });
        }
        return new Response('ok', { status: 200 });
      };

      const adapter = new LiveRPCSimulationAdapter({
        rpcUrl: 'https://rpc.mevblocker.io',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const tx = createTestCanonicalTx();
      const res = await adapter.simulate(tx);
      expect(res.status).toBe('UNAVAILABLE');
      expect(res.provenance).toBe('NONE');
      expect(ethCallAttempted).toBe(false);
    });

    it('unconfigured LiveRPCSimulationAdapter reports UNAVAILABLE and never manufactures fake results', async () => {
      const adapter = new LiveRPCSimulationAdapter({});
      const res = await adapter.simulate(createTestCanonicalTx());
      expect(res.status).toBe('UNAVAILABLE');
      expect(res.provenance).toBe('NONE');
      expect(res.blockNumber).toBeNull();
    });
  });

  describe('D. Pipeline Orchestration & Production Boundaries', () => {
    it('DEFAULT_PUBLIC_ENDPOINTS are configured with real free public URLs', () => {
      expect(DEFAULT_PUBLIC_ENDPOINTS.sourcifyApiUrl).toBe('https://sourcify.dev/server');
      expect(DEFAULT_PUBLIC_ENDPOINTS.rpcUrl).toBe('https://rpc.mevblocker.io');
      expect(DEFAULT_PUBLIC_ENDPOINTS.registryUrl).toContain('clear-signing-erc7730-registry');
    });

    it('createPublicLiveEvidencePipeline() returns an EvidencePipeline without mock transport injection', () => {
      const pipeline = createPublicLiveEvidencePipeline();
      expect(pipeline).toBeInstanceOf(EvidencePipeline);
      expect(pipeline.policyEngine).toBeDefined();
    });

    it('createLiveEvidencePipeline() strictly rejects custom transport injection', () => {
      expect(() => {
        createLiveEvidencePipeline({
          sourcifyFetchFn: () => {},
        } as unknown as Record<string, unknown>);
      }).toThrow(/rejected custom transport or adapter injection/);

      expect(() => {
        createLiveEvidencePipeline({
          rpcProvider: {},
        } as unknown as Record<string, unknown>);
      }).toThrow(/rejected custom transport or adapter injection/);
    });

    it('createPublicLiveEvidencePipeline() also strictly rejects custom transport injection', () => {
      expect(() => {
        createPublicLiveEvidencePipeline({
          sourcifyFetchFn: () => {},
        } as unknown as Record<string, unknown>);
      }).toThrow(/rejected custom transport or adapter injection/);

      expect(() => {
        createPublicLiveEvidencePipeline({
          contractProvider: {},
        } as unknown as Record<string, unknown>);
      }).toThrow(/rejected custom transport or adapter injection/);
    });
  });
});

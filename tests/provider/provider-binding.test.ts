import { describe, it, expect } from 'vitest';
import { encodeFunctionData } from 'viem';
import {
  ActionProofProviderProxy,
  MockWalletProvider,
  DeterministicBarrier,
  ActionProofResult,
} from '../../src/provider/index.js';
import { EvidencePipeline, createLiveEvidencePipeline } from '../../src/evidence/pipeline.js';
import {
  LocalFixtureSimulationAdapter,
  UnavailableSimulationAdapter,
  MockLiveSimulationAdapter,
} from '../../src/analysis/simulation.js';
import { MockLiveContractAdapter } from '../../src/analysis/contract.js';
import { MockLiveERC7730Adapter } from '../../src/intent/erc7730.js';
import {
  KNOWN_SWAP_ABI,
  KNOWN_ERC20_ABI,
} from '../../src/analysis/decoder.js';
import type { StructuredIntent } from '../../src/intent/structured.js';

const USER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
const ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485' as const;

const DECLARED_TRANSFER: StructuredIntent = {
  category: 'TRANSFER',
  expectedRecipient: ROUTER,
  rawDescription: 'Transfer token to router',
};

// Transfer calldata
const DATA_TRANSFER = '0xa9059cbb00000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc450000000000000000000000000000000000000000000000000000000005f5e100' as const;
// Unlimited approve calldata
const DATA_APPROVE_MAX = '0x095ea7b3000000000000000000000000e64ba38a4b958c72bc0d421150ba464636422485ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as const;

function createBaseType2Tx(): Record<string, unknown> {
  return {
    from: USER,
    to: USDC,
    value: '0x0',
    data: DATA_TRANSFER,
    chainId: 1,
    type: '0x2',
    nonce: '0x1',
    gas: '0x186a0',
    maxFeePerGas: '0x3b9aca00',
    maxPriorityFeePerGas: '0x3b9aca00',
    accessList: [
      {
        address: USDC,
        storageKeys: [
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        ],
      },
    ],
  };
}

function createBaseType0Tx(): Record<string, unknown> {
  return {
    from: USER,
    to: USDC,
    value: '0x0',
    data: DATA_TRANSFER,
    chainId: 1,
    type: '0x0',
    nonce: '0x1',
    gas: '0x186a0',
    gasPrice: '0x3b9aca00',
  };
}

describe('Provider Binding Security Specification Tests', () => {
  it('Test 1A: Normal request with live external evidence forwards cleanly with VERIFIED', async () => {
    const wallet = new MockWalletProvider();
    const pipeline = createLiveEvidencePipeline();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      evidencePipeline: pipeline,
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('VERIFIED');
    expect(result.blockedBeforeForwarding).toBe(false);
    expect(result.txHash).toBeTruthy();
    expect(wallet.received.length).toBe(1);
    expect(wallet.received[0].to).toBe(USDC);
  });

  it('Test 1B: Normal request with UNAVAILABLE simulation forwards with honest WARNING (degraded evidence)', async () => {
    const wallet = new MockWalletProvider();
    const pipeline = new EvidencePipeline({
      simulationAdapter: new UnavailableSimulationAdapter('No live EVM backend configured'),
    });
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      evidencePipeline: pipeline,
      onWarningConfirmation: async () => true,
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('WARNING');
    expect(result.reason).toMatch(/Simulation evidence unavailable/i);
    expect(result.blockedBeforeForwarding).toBe(false);
    expect(result.txHash).toBeTruthy();
    expect(wallet.received.length).toBe(1);
  });

  it('Test 2: Calldata mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.data = DATA_APPROVE_MAX;
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 3: Destination address mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.to = ATTACKER;
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 4: Value mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.value = '0x8ac7230489e80000';
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 5: Chain identity mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.chainId = 137;
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 7: Deterministic post-verification mutation with explicit synchronization barrier BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const barrier = new DeterministicBarrier();

    let mutationHappened = false;
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async () => {
        await barrier.arrive();
      },
    });

    const liveTx = createBaseType2Tx();
    const dispatchPromise = proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    });

    await barrier.waitUntilReached();
    liveTx.to = ATTACKER;
    mutationHappened = true;
    barrier.release();

    const result = (await dispatchPromise) as ActionProofResult;

    expect(mutationHappened).toBe(true);
    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 8: Unknown property injection is rejected / blocked', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet);

    const liveTx = {
      ...createBaseType2Tx(),
      maliciousField: 'exploit',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('UNKNOWN_FIELD:maliciousField');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 9: Supplied gas parameter mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.gas = '0x5208';
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 10: Transaction type mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.type = '0x0';
        delete tx.maxFeePerGas;
        delete tx.maxPriorityFeePerGas;
        delete tx.accessList;
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 11: EIP-7702 authorization list produces UNSUPPORTED and blocks forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet);

    const liveTx = {
      ...createBaseType2Tx(),
      authorizationList: [{ chainId: '0x1', address: ATTACKER, nonce: '0x0', yParity: '0x0', r: '0x0', s: '0x0' }],
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('UNSUPPORTED');
    expect(result.reason).toBe('UNSUPPORTED_FIELD:authorizationList');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Test 12: EIP-5792 wallet_sendCalls produces UNSUPPORTED and blocks forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet);

    const result = (await proxy.request({
      method: 'wallet_sendCalls',
      params: [{ version: '1.0', from: USER, calls: [] }],
    })) as ActionProofResult;

    expect(result.verdict).toBe('UNSUPPORTED');
    expect(result.reason).toBe('UNSUPPORTED_WRITE_PATH:wallet_sendCalls');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Field Mutation: "from" address mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.from = ATTACKER;
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Field Mutation: "nonce" mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.nonce = '0x99';
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Field Mutation: "gasPrice" in Type-0 tx mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.gasPrice = '0x77359400';
      },
    });

    const liveTx = createBaseType0Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Field Mutation: "maxFeePerGas" in Type-2 tx mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.maxFeePerGas = '0x77359400';
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Field Mutation: "maxPriorityFeePerGas" in Type-2 tx mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.maxPriorityFeePerGas = '0x10';
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Field Mutation: "accessList" entry addition after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        (tx.accessList as Array<{ address: string; storageKeys: string[] }>).push({
          address: ATTACKER,
          storageKeys: [],
        });
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Nested Mutation: "accessList[0].storageKeys" mutation after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        // Mutate inside nested array
        (tx.accessList as Array<{ address: string; storageKeys: string[] }>)[0].storageKeys.push(
          '0x0000000000000000000000000000000000000000000000000000000000000002'
        );
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Unsupported-Field Insertion: adding authorizationList after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.authorizationList = [];
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Unknown-Field Insertion: adding unknown property after verification BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      barrier: async (tx) => {
        tx.unauthorizedKey = 'injected';
      },
    });

    const liveTx = createBaseType2Tx();
    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [liveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Adversarial Getter Object: getter returning mutated value is caught by verified snapshot check', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
    });

    // Create an object with a getter that alters its value after the first read
    let reads = 0;
    const adversarialTx = {
      from: USER,
      get to() {
        reads++;
        // First read in initial snapshot returns USDC; subsequent reads return ATTACKER
        return reads > 1 ? ATTACKER : USDC;
      },
      value: '0x0',
      data: DATA_TRANSFER,
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [adversarialTx],
    })) as ActionProofResult;

    // The forwarding snapshot evaluates getters at pre-forward time, detecting divergence
    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Adversarial ES6 Proxy: proxy altering destination between verification and recheck BLOCKS forwarding', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
    });

    let proxyReads = 0;
    const baseObj = {
      from: USER,
      to: USDC,
      value: '0x0',
      data: DATA_TRANSFER,
      chainId: 1,
      type: '0x2',
    };

    const adversarialProxy = new Proxy(baseObj, {
      get(target, prop, receiver) {
        if (prop === 'to') {
          proxyReads++;
          // First snapshot read returns USDC; recheck snapshot returns ATTACKER
          return proxyReads > 1 ? ATTACKER : USDC;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [adversarialProxy],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toBe('COMMITMENT_MISMATCH');
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Adversarial Getter targeting Wallet: getter mutating on 3rd read fails because wallet receives static immutable snapshot', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: DECLARED_TRANSFER,
      onWarningConfirmation: async () => true,
    });

    let getterReads = 0;
    const adversarialTx = {
      from: USER,
      get to() {
        getterReads++;
        // Read 1 (initial snapshot): returns USDC
        // Read 2 (pre-forward snapshot): returns USDC (commitments match!)
        // Read 3 (if wallet were given the getter object): would return ATTACKER
        return getterReads >= 3 ? ATTACKER : USDC;
      },
      value: '0x0',
      data: DATA_TRANSFER,
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [adversarialTx],
    })) as ActionProofResult;

    // Transaction is forwarded because read 1 == read 2 == USDC
    expect(result.blockedBeforeForwarding).toBe(false);
    expect(wallet.received.length).toBe(1);

    // CRITICAL SECURITY PROPERTY:
    // The wallet received the immutable static snapshot forwardPayload, NOT the adversarial getter object!
    const receivedTx = wallet.received[0];
    expect(receivedTx.to).toBe(USDC);
    // getterReads is exactly 2: the wallet NEVER executed getter read 3!
    expect(getterReads).toBe(2);
  });

  it('Deceptive UI Defense: Declaring "Transfer 10 USDC" while invoking approve() is BLOCKED', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Transfer 10 USDC', // UI claims Transfer
    });

    // Approval calldata for 100 USDC (standard amount, not unlimited)
    const DATA_STANDARD_APPROVE = '0x095ea7b3000000000000000000000000e64ba38a4b958c72bc0d421150ba4646364224850000000000000000000000000000000000000000000000000000000005f5e100' as const;

    const deceptiveTx = {
      from: USER,
      to: USDC,
      value: '0x0',
      data: DATA_STANDARD_APPROVE,
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [deceptiveTx],
    })) as ActionProofResult;

    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toMatch(/Deceptive UI claim/i);
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  it('Fail Closed on Unknown Calldata: Transaction with un-decodable selector is BLOCKED and wallet receives nothing', async () => {
    const wallet = new MockWalletProvider();
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Execute arbitrary custom contract call',
    });

    const unknownTx = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: '0x123456780000000000000000000000000000000000000000000000000000000000000001',
      chainId: 1,
      type: '0x2',
    };

    const result = (await proxy.request({
      method: 'eth_sendTransaction',
      params: [unknownTx],
    })) as ActionProofResult;

    // Fail closed: ActionProof cannot verify transaction semantics, so it does not forward
    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toMatch(/Unrecognized calldata selector/i);
    expect(result.blockedBeforeForwarding).toBe(true);
    expect(wallet.received.length).toBe(0);
  });

  describe('H3: WARNING Fail-Closed Semantics & Confirmation Boundary', () => {
    it('H3-1: WARNING halts before wallet when no confirmation callback is provided', async () => {
      const wallet = new MockWalletProvider();
      const pipeline = new EvidencePipeline({
        simulationAdapter: new UnavailableSimulationAdapter('No live EVM backend configured'),
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(result.forwardingStatus).toBe('HALTED_AWAITING_CONFIRMATION');
      expect(result.txHash).toBeNull();
      expect(wallet.received.length).toBe(0);
    });

    it('H3-2: WARNING halts before wallet when confirmation callback returns false', async () => {
      const wallet = new MockWalletProvider();
      const pipeline = new EvidencePipeline({
        simulationAdapter: new UnavailableSimulationAdapter('No live EVM backend configured'),
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        onWarningConfirmation: async () => false, // User explicitly rejects WARNING
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(result.forwardingStatus).toBe('BLOCKED_BEFORE_FORWARDING');
      expect(result.forwardingDetail).toBe('CONFIRMATION_REJECTED');
      expect(result.txHash).toBeNull();
      expect(wallet.received.length).toBe(0);
    });

    it('H3-3: WARNING forwards ONLY when confirmation callback returns true', async () => {
      const wallet = new MockWalletProvider();
      const pipeline = new EvidencePipeline({
        simulationAdapter: new UnavailableSimulationAdapter('No live EVM backend configured'),
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        onWarningConfirmation: async () => true, // User confirms forwarding
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.blockedBeforeForwarding).toBe(false);
      expect(result.forwardingStatus).toBe('FORWARDED_AFTER_CONFIRMATION');
      expect(result.forwardingDetail).toBe('FORWARDED_AFTER_CONFIRMATION');
      expect(result.txHash).toBeTruthy();
      expect(wallet.received.length).toBe(1);
    });

    it('H3-4: Forwarded WARNING preserves verdict WARNING and does NOT become VERIFIED', async () => {
      const wallet = new MockWalletProvider();
      const pipeline = new EvidencePipeline({
        simulationAdapter: new UnavailableSimulationAdapter('No live EVM backend configured'),
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        onWarningConfirmation: async () => true,
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.verdict).not.toBe('VERIFIED');
      expect(result.forwardingStatus).toBe('FORWARDED_AFTER_CONFIRMATION');
    });

    it('H3-5: Wallet receives 0 calls on halted WARNING', async () => {
      const wallet = new MockWalletProvider();
      const pipeline = new EvidencePipeline({
        simulationAdapter: new UnavailableSimulationAdapter('No live EVM backend configured'),
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
      });

      const liveTx = createBaseType2Tx();
      await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      });

      expect(wallet.received.length).toBe(0);
    });
  });

  describe('M7: Unhandled Signing & Alternative Sending Method Gating', () => {
    const REJECTED_METHODS = [
      'eth_sendRawTransaction',
      'eth_signTransaction',
      'eth_sign',
      'personal_sign',
      'eth_signTypedData',
      'eth_signTypedData_v1',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
      'wallet_sendTransaction',
      'wallet_sendCalls',
      'wallet_sign',
      'eth_sendUserOperation',
      'eth_estimateUserOperationGas',
    ];

    it.each(REJECTED_METHODS)('M7: Rejects %s as UNSUPPORTED and blocks wallet forwarding', async (method) => {
      const wallet = new MockWalletProvider();
      const proxy = new ActionProofProviderProxy(wallet);

      const result = (await proxy.request({
        method,
        params: ['0x123', '0xabc'],
      })) as ActionProofResult;

      expect(result.verdict).toBe('UNSUPPORTED');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(result.txHash).toBeNull();
      if (
        method === 'wallet_sendCalls' ||
        method === 'eth_sendUserOperation' ||
        method === 'eth_estimateUserOperationGas'
      ) {
        expect(result.reason).toBe(`UNSUPPORTED_WRITE_PATH:${method}`);
      } else {
        expect(result.reason).toBe(`UNSUPPORTED_SIGNING_METHOD:${method}`);
      }
      expect(wallet.received.length).toBe(0);
    });

    it('M7: Read-only and benign methods continue to pass through to wallet', async () => {
      const wallet = new MockWalletProvider();
      const proxy = new ActionProofProviderProxy(wallet);

      // eth_chainId
      const chainId = await proxy.request({ method: 'eth_chainId' });
      expect(chainId).toBe('0x1');

      // eth_accounts
      const accounts = await proxy.request({ method: 'eth_accounts' });
      expect(Array.isArray(accounts)).toBe(true);
      expect((accounts as string[])[0]).toBe('0x04f8996da763b7a969b1028ee3007569eaf3a635');
    });
  });

  describe('SEC-AA-01: ERC-4337 UserOperation Gating Specification', () => {
    it('SEC-AA-01-1: eth_sendUserOperation returns UNSUPPORTED and wallet receives 0 requests', async () => {
      const wallet = new MockWalletProvider();
      const proxy = new ActionProofProviderProxy(wallet);

      const result = (await proxy.request({
        method: 'eth_sendUserOperation',
        params: [{ sender: USER, callData: '0x1234' }, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
      })) as ActionProofResult;

      expect(result.verdict).toBe('UNSUPPORTED');
      expect(result.reason).toBe('UNSUPPORTED_WRITE_PATH:eth_sendUserOperation');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(result.txHash).toBeNull();
      expect(wallet.received.length).toBe(0);
    });

    it('SEC-AA-01-2: eth_estimateUserOperationGas returns UNSUPPORTED and wallet receives 0 requests', async () => {
      const wallet = new MockWalletProvider();
      const proxy = new ActionProofProviderProxy(wallet);

      const result = (await proxy.request({
        method: 'eth_estimateUserOperationGas',
        params: [{ sender: USER, callData: '0x1234' }, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
      })) as ActionProofResult;

      expect(result.verdict).toBe('UNSUPPORTED');
      expect(result.reason).toBe('UNSUPPORTED_WRITE_PATH:eth_estimateUserOperationGas');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('SEC-AA-01-3: Malicious eth_sendUserOperation containing attacker-controlled callData is UNSUPPORTED and never reaches wallet', async () => {
      const wallet = new MockWalletProvider();
      const proxy = new ActionProofProviderProxy(wallet);

      // Stealth unlimited approval tucked into a UserOp callData
      const maliciousCallData = DATA_APPROVE_MAX;
      const userOp = {
        sender: USER,
        nonce: '0x0',
        initCode: '0x',
        callData: maliciousCallData,
        callGasLimit: '0x10000',
        verificationGasLimit: '0x10000',
        preVerificationGas: '0x5000',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
        paymasterAndData: '0x',
        signature: '0x1234',
      };

      const result = (await proxy.request({
        method: 'eth_sendUserOperation',
        params: [userOp, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
      })) as ActionProofResult;

      expect(result.verdict).toBe('UNSUPPORTED');
      expect(result.reason).toBe('UNSUPPORTED_WRITE_PATH:eth_sendUserOperation');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('SEC-AA-01-4: eth_sendUserOperation with a valid-looking UserOperation is still UNSUPPORTED and never reaches wallet', async () => {
      const wallet = new MockWalletProvider();
      const proxy = new ActionProofProviderProxy(wallet);

      // Benign swap callData inside a UserOp
      const benignSwapData = encodeFunctionData({
        abi: KNOWN_SWAP_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: USDC,
          tokenOut: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          fee: 3000,
          recipient: USER,
          deadline: 1893456000n,
          amountIn: 100000000n,
          amountOutMinimum: 50000000000000000n,
          sqrtPriceLimitX96: 0n,
        }],
      });

      const userOp = {
        sender: USER,
        nonce: '0x1',
        callData: benignSwapData,
        callGasLimit: '0x50000',
      };

      const result = (await proxy.request({
        method: 'eth_sendUserOperation',
        params: [userOp, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
      })) as ActionProofResult;

      expect(result.verdict).toBe('UNSUPPORTED');
      expect(result.reason).toBe('UNSUPPORTED_WRITE_PATH:eth_sendUserOperation');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('SEC-AA-01-5: throwOnBlock throws Error for eth_sendUserOperation', async () => {
      const wallet = new MockWalletProvider();
      const proxy = new ActionProofProviderProxy(wallet, { throwOnBlock: true });

      await expect(
        proxy.request({
          method: 'eth_sendUserOperation',
          params: [{ sender: USER }, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
        })
      ).rejects.toThrow(/UNSUPPORTED_WRITE_PATH:eth_sendUserOperation/);

      expect(wallet.received.length).toBe(0);
    });
  });

  describe('H4: Dynamic Wallet Chain Synchronization', () => {
    it('H4-1: Payload chainId != active wallet chainId BLOCKS forwarding with CHAIN_ID_MISMATCH', async () => {
      const wallet = new MockWalletProvider(1); // Wallet is on chain 1
      const proxy = new ActionProofProviderProxy(wallet);

      const txWithWrongChain = {
        ...createBaseType2Tx(),
        chainId: 137, // Polygon chain ID
      };

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [txWithWrongChain],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toBe('CHAIN_ID_MISMATCH');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('H4-2: Omitted payload chainId dynamically adopts wallet chainId', async () => {
      const wallet = new MockWalletProvider(10); // Optimism (chain ID 10)
      const pipeline = createLiveEvidencePipeline();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
      });

      const txOmittedChain = createBaseType2Tx();
      delete txOmittedChain.chainId;

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [txOmittedChain],
      })) as ActionProofResult;

      expect(result.verdict).toBe('VERIFIED');
      expect(result.blockedBeforeForwarding).toBe(false);
      expect(proxy.activeChainId).toBe(10);
      expect(result.evidence?.transaction.canonical.chainId).toBe(10);
      expect(result.evidence?.transaction.activeChainId).toBe(10);
      expect(wallet.received.length).toBe(1);
    });

    it('H4-3: Concurrent wallet chain change before pre-forward recheck BLOCKS forwarding', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = createLiveEvidencePipeline();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        barrier: async () => {
          // Attacker or user switches wallet network in-flight!
          wallet.chainId = 137;
        },
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toBe('CONCURRENT_CHAIN_SWITCH');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('H4-4: Matching payload chainId and wallet chainId succeeds normally', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = createLiveEvidencePipeline();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
      });

      const liveTx = createBaseType2Tx(); // chainId: 1
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('VERIFIED');
      expect(result.blockedBeforeForwarding).toBe(false);
      expect(wallet.received.length).toBe(1);
    });
  });

  describe('M2: Canonical RPC Forwarding Specification', () => {
    it('M2-5: Wallet mock receives the exact canonical payload, NOT the raw snapshot or liveRequest', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = createLiveEvidencePipeline();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('VERIFIED');
      expect(wallet.received.length).toBe(1);

      const forwarded = wallet.received[0] as Record<string, unknown>;
      // Verify forwarded payload is derived from canonical representation
      expect(forwarded.from).toBe(USER);
      expect(forwarded.to).toBe(USDC);
      expect(forwarded.value).toBe('0x0');
      expect(forwarded.data).toBe(DATA_TRANSFER.toLowerCase());
      expect(forwarded.chainId).toBe(1);
      expect(forwarded.type).toBe('0x2');
      // The forwarded object reference must not be the raw liveTx object
      expect(forwarded).not.toBe(liveTx);
    });

    it('M2-6: Normalizes mixed-case addresses in forwarded payload', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = createLiveEvidencePipeline();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
      });

      const liveTx = createBaseType2Tx();
      liveTx.from = '0x04F8996DA763B7A969B1028EE3007569EAF3A635';
      liveTx.to = '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48';

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('VERIFIED');
      const forwarded = wallet.received[0] as Record<string, unknown>;
      expect(forwarded.from).toBe(USER);
      expect(forwarded.to).toBe(USDC);
    });

    it('M2-7: Extra unverified properties in live request are rejected and NOT forwarded to wallet', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new LocalFixtureSimulationAdapter(),
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
      });

      const liveTx = createBaseType2Tx();
      (liveTx as Record<string, unknown>).extraAttackerField = 'attack_value';

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      // Because schema validation rejects unknown fields by default
      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toBe('UNKNOWN_FIELD:extraAttackerField');
      expect(wallet.received.length).toBe(0);
    });
  });

  describe('M3: Mutable Barrier & Declared-Action Hook Hardening Specification', () => {
    it('M3-1: Confirmation callback attempts to mutate transaction.to in-flight -> BLOCKED with COMMITMENT_MISMATCH', async () => {
      const wallet = new MockWalletProvider(1);
      const liveTx = createBaseType2Tx();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async () => {
          // Attacker / callback mutates transaction destination during confirmation
          (liveTx as Record<string, unknown>).to = ATTACKER;
          return true;
        },
      });

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toBe('COMMITMENT_MISMATCH');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M3-2: Confirmation callback attempts to mutate transaction.value in-flight -> BLOCKED with COMMITMENT_MISMATCH', async () => {
      const wallet = new MockWalletProvider(1);
      const liveTx = createBaseType2Tx();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async () => {
          // Attacker attempts to siphon ETH by setting non-zero value during confirmation
          (liveTx as Record<string, unknown>).value = '0xde0b6b3a7640000'; // 1 ETH
          return true;
        },
      });

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toBe('COMMITMENT_MISMATCH');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M3-3: Confirmation callback attempts to mutate nested accessList in-flight -> BLOCKED with COMMITMENT_MISMATCH', async () => {
      const wallet = new MockWalletProvider(1);
      const liveTx = createBaseType2Tx();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async () => {
          // Attacker mutates nested accessList entry
          const acl = liveTx.accessList as Array<{ address: string; storageKeys: string[] }>;
          acl[0].address = ATTACKER;
          return true;
        },
      });

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toBe('COMMITMENT_MISMATCH');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M3-4: Confirmation callback attempts to mutate structuredIntent.expectedRecipient -> fails/ignored, intent remains immutable', async () => {
      const wallet = new MockWalletProvider(1);
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async (evidence) => {
          try {
            // Attempt to mutate deep-frozen evidence and intent
            (evidence.application.structuredIntent as unknown as Record<string, unknown>).expectedRecipient = ATTACKER;
          } catch {}
          return true;
        },
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      // In strict mode modifying frozen object throws; in non-strict mode it fails silently
      // In either case, the proxy's recorded structuredIntent MUST remain ROUTER
      expect(result.evidence?.application.structuredIntent?.expectedRecipient).toBe(ROUTER);
      expect(result.evidence?.application.structuredIntent?.expectedRecipient).not.toBe(ATTACKER);
      expect(result.verdict).toBe('WARNING');
      expect(result.forwardingStatus).toBe('FORWARDED_AFTER_CONFIRMATION');
      expect(wallet.received.length).toBe(1);
    });

    it('M3-5: Confirmation callback attempts to mutate structuredIntent.expectedSpender -> fails/ignored, intent remains immutable', async () => {
      const wallet = new MockWalletProvider(1);
      const declaredApprove: StructuredIntent = {
        category: 'APPROVE',
        expectedSpender: ROUTER,
        rawDescription: 'Approve router',
      };
      const approveData = encodeFunctionData({
        abi: KNOWN_ERC20_ABI,
        functionName: 'approve',
        args: [ROUTER, 100000000n],
      });

      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: declaredApprove,
        onWarningConfirmation: async (evidence) => {
          try {
            (evidence.application.structuredIntent as unknown as Record<string, unknown>).expectedSpender = ATTACKER;
          } catch {}
          return true;
        },
      });

      const liveTx = {
        from: USER,
        to: USDC,
        value: '0x0',
        data: approveData,
        chainId: 1,
        type: '0x2',
      };

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.evidence?.application.structuredIntent?.expectedSpender).toBe(ROUTER);
      expect(result.evidence?.application.structuredIntent?.expectedSpender).not.toBe(ATTACKER);
      expect(result.verdict).toBe('WARNING');
      expect(result.forwardingStatus).toBe('FORWARDED_AFTER_CONFIRMATION');
      expect(wallet.received.length).toBe(1);
    });

    it('M3-6: Confirmation callback attempts to mutate frozen evidence.policy.verdict -> verdict remains WARNING, not converted to VERIFIED', async () => {
      const wallet = new MockWalletProvider(1);
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async (evidence) => {
          try {
            // Attempt to forge verdict to VERIFIED
            (evidence.policy as unknown as Record<string, unknown>).verdict = 'VERIFIED';
          } catch {}
          return true;
        },
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      // Invariant: WARNING + confirmation is FORWARDED_AFTER_CONFIRMATION with verdict WARNING, NEVER VERIFIED
      expect(result.verdict).toBe('WARNING');
      expect(result.forwardingStatus).toBe('FORWARDED_AFTER_CONFIRMATION');
      expect(result.evidence?.policy.verdict).toBe('WARNING');
      expect(wallet.received.length).toBe(1);
    });

    it('M3-7: Confirmation callback attempts to replace live transaction object or return modified transaction -> discarded', async () => {
      const wallet = new MockWalletProvider(1);
      const liveTx = createBaseType2Tx();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async () => {
          // Callback returns a substituted transaction object instead of boolean true
          return {
            ...liveTx,
            to: ATTACKER,
          } as any;
        },
      });

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      // Returning an object is not `=== true`, so it is treated as unconfirmed / rejected
      expect(result.verdict).toBe('WARNING');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(result.forwardingDetail).toBe('CONFIRMATION_REJECTED');
      expect(wallet.received.length).toBe(0);
    });

    it('M3-8: Confirmation callback returns truthy non-boolean string "true" -> discarded / unconfirmed', async () => {
      const wallet = new MockWalletProvider(1);
      const liveTx = createBaseType2Tx();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async () => {
          // String "true" is truthy in JS, but ActionProof enforces strict boolean === true
          return 'true' as any;
        },
      });

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(result.forwardingDetail).toBe('CONFIRMATION_REJECTED');
      expect(wallet.received.length).toBe(0);
    });

    it('M3-9: Legitimate WARNING confirmation (returns true) results in FORWARDED_AFTER_CONFIRMATION with verdict WARNING', async () => {
      const wallet = new MockWalletProvider(1);
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async () => true,
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.forwardingStatus).toBe('FORWARDED_AFTER_CONFIRMATION');
      expect(result.blockedBeforeForwarding).toBe(false);
      expect(result.txHash).toBeTruthy();
      expect(wallet.received.length).toBe(1);
      expect(wallet.received[0].to).toBe(USDC);
    });

    it('M3-10: WARNING callback mutates liveRequest and then returns true -> BLOCKED with COMMITMENT_MISMATCH', async () => {
      const wallet = new MockWalletProvider(1);
      const liveTx = createBaseType2Tx();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        onWarningConfirmation: async () => {
          // Attacker callback mutates calldata to unlimited approval before confirming
          (liveTx as Record<string, unknown>).data = DATA_APPROVE_MAX;
          return true;
        },
      });

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toBe('COMMITMENT_MISMATCH');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M3-11: Post-verification mutation of proxy declaredAction does not alter in-flight request verification snapshot', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = createLiveEvidencePipeline();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        barrier: async () => {
          // Attacker attempts to change declaredAction on the proxy instance while request is in flight
          proxy.setDeclaredAction({
            category: 'APPROVE',
            expectedSpender: ATTACKER,
            rawDescription: 'Tampered intent description',
          });
        },
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      // The in-flight transaction evaluated against its request-scoped immutable snapshot
      expect(result.verdict).toBe('VERIFIED');
      expect(result.blockedBeforeForwarding).toBe(false);
      expect(wallet.received.length).toBe(1);
      expect(result.evidence?.application.structuredIntent?.category).toBe('TRANSFER');
    });

    it('M3-12: Normal supported swap remains VERIFIED and forwards canonical payload', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = createLiveEvidencePipeline();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: 'Swap 100 USDC -> ETH',
        evidencePipeline: pipeline,
      });

      const swapData = encodeFunctionData({
        abi: KNOWN_SWAP_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: USDC,
          tokenOut: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          fee: 3000,
          recipient: USER,
          deadline: 1893456000n,
          amountIn: 100000000n,
          amountOutMinimum: 50000000000000000n,
          sqrtPriceLimitX96: 0n,
        }],
      });

      const liveTx = {
        from: USER,
        to: ROUTER,
        value: '0x0',
        data: swapData,
        chainId: 1,
        type: '0x2',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
      };

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('VERIFIED');
      expect(result.blockedBeforeForwarding).toBe(false);
      expect(wallet.received.length).toBe(1);
      expect(wallet.received[0].to).toBe(ROUTER);
    });

    it('M3-13: Existing H2 attacker recipient remains BLOCKED despite valid structure', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new LocalFixtureSimulationAdapter(),
      });
      // Declares transfer to ROUTER, but calldata sends to ATTACKER
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER, // expectedRecipient: ROUTER
        evidencePipeline: pipeline,
      });

      const attackerTransferData = encodeFunctionData({
        abi: KNOWN_ERC20_ABI,
        functionName: 'transfer',
        args: [ATTACKER, 100000000n],
      });

      const liveTx = {
        from: USER,
        to: USDC,
        value: '0x0',
        data: attackerTransferData,
        chainId: 1,
        type: '0x2',
      };

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toContain('Recipient mismatch');
      expect(result.evidence?.policy.primaryReason).toMatch(/Recipient mismatch/i);
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M3-14: Existing H5 high-value approval remains correctly classified as HIGH_VALUE_APPROVAL', async () => {
      const wallet = new MockWalletProvider(1);
      // 5,000,000 USDC approval (USDC has 6 decimals, so 5,000,000 * 10^6 = 5,000,000,000,000 base units)
      // > 1,000,000 threshold -> HIGH_VALUE_APPROVAL (BLOCKED fail-closed under default policy)
      const highApprovalData = encodeFunctionData({
        abi: KNOWN_ERC20_ABI,
        functionName: 'approve',
        args: [ROUTER, 5000000000000n],
      });

      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: {
          category: 'APPROVE',
          expectedSpender: ROUTER,
          rawDescription: 'Approve 5M USDC',
        },
      });

      const liveTx = {
        from: USER,
        to: USDC,
        value: '0x0',
        data: highApprovalData,
        chainId: 1,
        type: '0x2',
      };

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toMatch(/High-value token approval/i);
      expect(result.evidence?.policy.verdict).toBe('BLOCKED');
      expect(result.evidence?.policy.rulesEvaluated.some(e => e.ruleId === 'RULE_02B_HIGH_VALUE_APPROVAL_CHECK')).toBe(true);
      expect(result.evidence?.decode.detectedApprovals[0]?.classification).toBe('HIGH_VALUE_APPROVAL');
      expect(result.evidence?.decode.detectedApprovals[0]?.normalizedAmount).toBe('5000000');
      expect(wallet.received.length).toBe(0);
    });
  });

  describe('M4: Evidence Provenance Integrity Specification', () => {
    it('M4-1: All evidence is LOCAL_FIXTURE in production policy -> verdict must NOT be security-grade VERIFIED, must be WARNING', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new LocalFixtureSimulationAdapter(),
        provenanceMode: 'PRODUCTION',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'PRODUCTION',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.verdict).not.toBe('VERIFIED');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M4-2: Sourcify fixture + 7730 fixture + fixture simulation in production policy evaluates to WARNING', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new LocalFixtureSimulationAdapter(),
        provenanceMode: 'PRODUCTION',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'PRODUCTION',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.evidence?.contract.provenance).toBe('LOCAL_FIXTURE');
      expect(result.evidence?.intent.provenance).toBe('LOCAL_FIXTURE');
      expect(result.evidence?.simulation.provenance).toBe('LOCAL_FIXTURE');
      expect(result.evidence?.policy.warnings.length).toBeGreaterThan(0);
      expect(result.evidence?.policy.rulesEvaluated.some(r => r.ruleId === 'RULE_10_EVIDENCE_PROVENANCE_INTEGRITY' && !r.passed)).toBe(true);
    });

    it('M4-3: LOCAL_FIXTURE contract identity: live simulation + live intent, but contract is LOCAL_FIXTURE -> degraded to WARNING', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new MockLiveSimulationAdapter(),
        erc7730Adapter: new MockLiveERC7730Adapter(),
        // contractAdapter defaults to LocalFixtureContractAdapter (LOCAL_FIXTURE)
        provenanceMode: 'PRODUCTION',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'PRODUCTION',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.evidence?.contract.provenance).toBe('LOCAL_FIXTURE');
      expect(result.evidence?.simulation.provenance).toBe('LIVE_BACKEND');
      expect(result.evidence?.intent.provenance).toBe('LIVE_REGISTRY');
      expect(result.evidence?.policy.warnings.some(w => /contract correspondence derived from local fixture/i.test(w))).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M4-4: LOCAL_FIXTURE ERC-7730 descriptor: live simulation + live contract, but intent is LOCAL_FIXTURE -> degraded to WARNING', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        contractAdapter: new MockLiveContractAdapter(),
        simulationAdapter: new MockLiveSimulationAdapter(),
        // erc7730Adapter defaults to ERC7730v2Adapter with local fixtures
        provenanceMode: 'PRODUCTION',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'PRODUCTION',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.evidence?.contract.provenance).toBe('LIVE_EXTERNAL');
      expect(result.evidence?.intent.provenance).toBe('LOCAL_FIXTURE');
      expect(result.evidence?.simulation.provenance).toBe('LIVE_BACKEND');
      expect(result.evidence?.policy.warnings.some(w => w.includes('ERC-7730 clear-signing descriptor derived from local fixture'))).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M4-5: LOCAL_FIXTURE simulation: live contract + live intent, but simulation is LocalFixtureSimulationAdapter -> degraded to WARNING', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        contractAdapter: new MockLiveContractAdapter(),
        erc7730Adapter: new MockLiveERC7730Adapter(),
        simulationAdapter: new LocalFixtureSimulationAdapter(),
        provenanceMode: 'PRODUCTION',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'PRODUCTION',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.evidence?.contract.provenance).toBe('LIVE_EXTERNAL');
      expect(result.evidence?.intent.provenance).toBe('LIVE_REGISTRY');
      expect(result.evidence?.simulation.provenance).toBe('LOCAL_FIXTURE');
      expect(result.evidence?.policy.warnings.some(w => w.includes('Simulation evidence derived from local fixture'))).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M4-6: Mixed provenance: contract = LIVE_EXTERNAL, intent = LIVE_REGISTRY, simulation = LOCAL_FIXTURE -> WARNING, not VERIFIED', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        contractAdapter: new MockLiveContractAdapter(),
        erc7730Adapter: new MockLiveERC7730Adapter(),
        simulationAdapter: new LocalFixtureSimulationAdapter(),
        provenanceMode: 'PRODUCTION',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'PRODUCTION',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.verdict).not.toBe('VERIFIED');
      expect(result.blockedBeforeForwarding).toBe(true);
    });

    it('M4-7: UNAVAILABLE evidence: missing required evidence source (simulation UNAVAILABLE) degrades to WARNING', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        contractAdapter: new MockLiveContractAdapter(),
        erc7730Adapter: new MockLiveERC7730Adapter(),
        simulationAdapter: new UnavailableSimulationAdapter('EVM RPC endpoint offline'),
        provenanceMode: 'PRODUCTION',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'PRODUCTION',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('WARNING');
      expect(result.evidence?.simulation.status).toBe('UNAVAILABLE');
      expect(result.evidence?.policy.warnings.some(w => w.includes('Simulation evidence unavailable'))).toBe(true);
      expect(result.blockedBeforeForwarding).toBe(true);
    });

    it('M4-8: Acceptable live external evidence for all checks -> VERIFIED', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = createLiveEvidencePipeline();
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'PRODUCTION',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('VERIFIED');
      expect(result.evidence?.contract.provenance).toBe('LIVE_EXTERNAL');
      expect(result.evidence?.intent.provenance).toBe('LIVE_REGISTRY');
      expect(result.evidence?.simulation.provenance).toBe('LIVE_BACKEND');
      expect(result.blockedBeforeForwarding).toBe(false);
      expect(wallet.received.length).toBe(1);
    });

    it('M4-9: Demo mode isolation: provenanceMode = "DEMO", fixtures allowed -> verdict is explicitly DEMO_VERIFIED, never labeled as live security-grade VERIFIED', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new LocalFixtureSimulationAdapter(),
        provenanceMode: 'DEMO',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'DEMO',
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('DEMO_VERIFIED');
      expect(result.verdict).not.toBe('VERIFIED');
      expect(result.forwardingDetail).toBe('DEMO_VERIFIED_FORWARD');
      expect(result.blockedBeforeForwarding).toBe(false);
      expect(wallet.received.length).toBe(1);
    });

    it('M4-10: Demo mode still blocks real attacks: stealth unlimited approval in demo mode MUST STILL BE BLOCKED', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new LocalFixtureSimulationAdapter(),
        provenanceMode: 'DEMO',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: 'Swap 100 USDC -> ETH',
        evidencePipeline: pipeline,
        provenanceMode: 'DEMO',
      });

      const attackTx = {
        from: USER,
        to: USDC,
        value: '0x0',
        data: DATA_APPROVE_MAX,
        chainId: 1,
        type: '0x2',
      };

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [attackTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M4-11: H2 attack in demo mode: Transfer recipient mismatch MUST STILL BE BLOCKED', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new LocalFixtureSimulationAdapter(),
        provenanceMode: 'DEMO',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: {
          category: 'TRANSFER',
          expectedRecipient: ROUTER,
          rawDescription: 'Transfer token to router',
        },
        evidencePipeline: pipeline,
        provenanceMode: 'DEMO',
      });

      // Transfer data directed to ATTACKER instead of ROUTER
      const attackerTransferData = encodeFunctionData({
        abi: KNOWN_ERC20_ABI,
        functionName: 'transfer',
        args: [ATTACKER, 100000000n],
      });

      const liveTx = {
        from: USER,
        to: USDC,
        value: '0x0',
        data: attackerTransferData,
        chainId: 1,
        type: '0x2',
      };

      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toMatch(/Recipient mismatch/i);
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });

    it('M4-12: M3 mutation in demo mode: Mutating request before Level-2 barrier MUST STILL BE BLOCKED', async () => {
      const wallet = new MockWalletProvider(1);
      const pipeline = new EvidencePipeline({
        simulationAdapter: new LocalFixtureSimulationAdapter(),
        provenanceMode: 'DEMO',
      });
      const proxy = new ActionProofProviderProxy(wallet, {
        declaredAction: DECLARED_TRANSFER,
        evidencePipeline: pipeline,
        provenanceMode: 'DEMO',
        barrier: async (tx) => {
          tx.to = ATTACKER;
        },
      });

      const liveTx = createBaseType2Tx();
      const result = (await proxy.request({
        method: 'eth_sendTransaction',
        params: [liveTx],
      })) as ActionProofResult;

      expect(result.verdict).toBe('BLOCKED');
      expect(result.reason).toBe('COMMITMENT_MISMATCH');
      expect(result.blockedBeforeForwarding).toBe(true);
      expect(wallet.received.length).toBe(0);
    });
  });
});

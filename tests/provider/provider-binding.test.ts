import { describe, it, expect } from 'vitest';
import {
  ActionProofProviderProxy,
  MockWalletProvider,
  DeterministicBarrier,
  ActionProofResult,
} from '../../src/provider/index.js';
import { EvidencePipeline } from '../../src/evidence/pipeline.js';
import {
  LocalFixtureSimulationAdapter,
  UnavailableSimulationAdapter,
} from '../../src/analysis/simulation.js';

const USER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
const ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485' as const;

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
  it('Test 1A: Normal request with fixture simulation forwards cleanly with VERIFIED', async () => {
    const wallet = new MockWalletProvider();
    const pipeline = new EvidencePipeline({
      simulationAdapter: new LocalFixtureSimulationAdapter(),
    });
    const proxy = new ActionProofProviderProxy(wallet, {
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
      evidencePipeline: pipeline,
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
      declaredAction: 'Transfer token',
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
});

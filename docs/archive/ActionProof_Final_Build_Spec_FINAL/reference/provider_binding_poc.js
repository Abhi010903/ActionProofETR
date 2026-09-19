'use strict';

/**
 * ActionProof Provider Binding Reference PoC
 *
 * This is a control-flow/security-invariant reference, NOT production code.
 * It intentionally uses Node SHA-256 so it remains dependency-free.
 * Production MUST use Ethereum-compatible Keccak-256.
 */

const crypto = require('crypto');
const hashFn = (bytes) => '0x' + crypto.createHash('sha256').update(bytes, 'utf8').digest('hex');

const USER = '0x04f8996da763b7a969b1028ee3007569eaf3a635';
const CONTRACT_A = '0x47a513840e908ec71da4e9940c2df4d3f5112797';
const ATTACKER = '0xe64ba38a4b958c72bc0d421150ba464636422485';
const DATA_A = '0xa9059cbb' + '0'.repeat(64) + '1'.repeat(64);
const APPROVE_MAX = '0x095ea7b3' + ATTACKER.slice(2).padStart(64, '0') + 'f'.repeat(64);

const SUPPORTED_KEYS = new Set([
  'from', 'to', 'value', 'data', 'chainId', 'nonce', 'gas', 'gasPrice',
  'maxFeePerGas', 'maxPriorityFeePerGas', 'accessList', 'type'
]);
const UNSUPPORTED_KEYS = new Set(['maxFeePerBlobGas', 'blobVersionedHashes', 'authorizationList']);

function normalizeAddress(v) {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error('INVALID_ADDRESS');
  return v.toLowerCase();
}
function normalizeQuantity(v) {
  if (v === undefined || v === null) return '0x0';
  if (typeof v === 'number' || typeof v === 'bigint') v = '0x' + BigInt(v).toString(16);
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]+$/.test(v)) throw new Error('INVALID_QUANTITY');
  const n = BigInt(v);
  return '0x' + n.toString(16);
}
function normalizeData(v) {
  if (v === undefined || v === null || v === '') return '0x';
  if (typeof v !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(v)) throw new Error('INVALID_DATA');
  return v.toLowerCase();
}
function normalizeAccessList(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error('INVALID_ACCESS_LIST');
  return v.map((e) => {
    if (!e || typeof e !== 'object') throw new Error('INVALID_ACCESS_LIST_ENTRY');
    const keys = Array.isArray(e.storageKeys) ? e.storageKeys.map((k) => {
      if (typeof k !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error('INVALID_STORAGE_KEY');
      return k.toLowerCase();
    }).sort() : [];
    return { address: normalizeAddress(e.address), storageKeys: keys };
  }).sort((a,b) => a.address.localeCompare(b.address));
}

function canonicalize(tx, activeChainId = 1) {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) throw new Error('INVALID_TX');
  for (const key of Object.keys(tx)) {
    if (UNSUPPORTED_KEYS.has(key)) throw new Error('UNSUPPORTED_FIELD:' + key);
    if (!SUPPORTED_KEYS.has(key)) throw new Error('UNKNOWN_FIELD:' + key);
  }
  if (tx.to === undefined) throw new Error('UNSUPPORTED_CONTRACT_CREATION');
  const chainId = tx.chainId === undefined ? activeChainId : Number(BigInt(normalizeQuantity(tx.chainId)));
  if (!Number.isSafeInteger(chainId) || chainId < 0 || chainId !== activeChainId) throw new Error('CHAIN_MISMATCH');
  const type = tx.type === undefined ? '0x0' : normalizeQuantity(tx.type);
  if (!['0x0', '0x1', '0x2'].includes(type)) throw new Error('UNSUPPORTED_TX_TYPE:' + type);

  const c = {
    domain: 'actionproof.request.v1',
    type,
    from: normalizeAddress(tx.from),
    to: normalizeAddress(tx.to),
    value: normalizeQuantity(tx.value),
    data: normalizeData(tx.data),
    chainId,
    nonce: tx.nonce === undefined ? null : normalizeQuantity(tx.nonce),
    gas: tx.gas === undefined ? null : normalizeQuantity(tx.gas),
    gasPrice: tx.gasPrice === undefined ? null : normalizeQuantity(tx.gasPrice),
    maxFeePerGas: tx.maxFeePerGas === undefined ? null : normalizeQuantity(tx.maxFeePerGas),
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas === undefined ? null : normalizeQuantity(tx.maxPriorityFeePerGas),
    accessList: normalizeAccessList(tx.accessList),
  };
  return c;
}
function commitment(tx, activeChainId = 1) {
  const canonical = canonicalize(tx, activeChainId);
  return { canonical, hash: hashFn(JSON.stringify(canonical)) };
}

class MockWalletProvider {
  constructor() { this.received = []; }
  async request({ method, params }) {
    if (method !== 'eth_sendTransaction') throw new Error('UNSUPPORTED_METHOD');
    this.received.push(JSON.parse(JSON.stringify(params[0])));
    return '0xMOCK_' + this.received.length;
  }
}

class ActionProofProviderProxy {
  constructor(wallet, options = {}) {
    this.wallet = wallet;
    this.activeChainId = options.activeChainId ?? 1;
    this.verify = options.verify ?? (async () => 'VERIFIED');
    this.barrier = options.barrier ?? (async () => {});
  }
  async request(request) {
    if (request.method !== 'eth_sendTransaction') throw new Error('UNSUPPORTED_METHOD');
    const live = request.params[0];
    const snapshot = JSON.parse(JSON.stringify(live));
    const verified = commitment(snapshot, this.activeChainId);
    const verdict = await this.verify(verified.canonical);
    if (verdict === 'BLOCKED' || verdict === 'UNSUPPORTED') return { verdict, txHash: null };
    await this.barrier(live); // deterministic test synchronization point
    let current;
    try { current = commitment(live, this.activeChainId); } catch (e) {
      return { verdict: 'BLOCKED', txHash: null, reason: 'UNCANONICALIZABLE_FORWARD_REQUEST', detail: e.message };
    }
    if (current.hash !== verified.hash) return { verdict: 'BLOCKED', txHash: null, reason: 'COMMITMENT_MISMATCH' };
    const txHash = await this.wallet.request({ method: 'eth_sendTransaction', params: [live] });
    return { verdict, txHash, commitment: verified.hash };
  }
}

function txA() { return { from: USER, to: CONTRACT_A, value: '0x0', data: DATA_A, chainId: 1, type: '0x2' }; }
const results = [];
const assert = (name, pass, details = {}) => results.push({ name, pass: Boolean(pass), ...details });

async function mutationTest(name, mutate) {
  const wallet = new MockWalletProvider();
  const live = txA();
  const proxy = new ActionProofProviderProxy(wallet, { barrier: async () => mutate(live) });
  const result = await proxy.request({ method: 'eth_sendTransaction', params: [live] });
  assert(name, result.verdict === 'BLOCKED' && wallet.received.length === 0, { result });
}

async function main() {
  {
    const wallet = new MockWalletProvider();
    const result = await new ActionProofProviderProxy(wallet).request({ method: 'eth_sendTransaction', params: [txA()] });
    assert('TEST1_NORMAL', result.verdict === 'VERIFIED' && wallet.received.length === 1, { result });
  }
  await mutationTest('TEST2_DATA_MUTATION', (tx) => { tx.data = APPROVE_MAX; });
  await mutationTest('TEST3_DESTINATION_MUTATION', (tx) => { tx.to = ATTACKER; });
  await mutationTest('TEST4_VALUE_MUTATION', (tx) => { tx.value = '0xde0b6b3a7640000'; });
  await mutationTest('TEST5_CHAINID_MUTATION', (tx) => { tx.chainId = 137; });
  {
    const a = commitment({ from: USER, to: CONTRACT_A, data: DATA_A, chainId: 1, type: '0x2' });
    const b = commitment({ from: USER, to: CONTRACT_A, value: '0x0', data: DATA_A, chainId: 1, type: '0x2' });
    const c = commitment({ from: USER, to: CONTRACT_A, value: '0x00', data: DATA_A, chainId: 1, type: '0x2' });
    assert('TEST6_CANONICAL_EQUIVALENCE', a.hash === b.hash && b.hash === c.hash);
  }
  await mutationTest('TEST7_POST_VERIFICATION_MUTATION', (tx) => { tx.to = ATTACKER; });
  {
    let blocked = false;
    try { commitment({ ...txA(), unexpected: 'x' }); } catch (e) { blocked = String(e.message).startsWith('UNKNOWN_FIELD'); }
    assert('TEST8_UNKNOWN_FIELD', blocked);
  }
  await mutationTest('TEST9_SUPPLIED_GAS_MUTATION', (tx) => { tx.gas = '0x99999'; });
  await mutationTest('TEST10_TYPE_MUTATION', (tx) => { tx.type = '0x0'; });
  {
    let unsupported = false;
    try { commitment({ ...txA(), authorizationList: [] }); } catch (e) { unsupported = String(e.message).startsWith('UNSUPPORTED_FIELD'); }
    assert('TEST11_EIP7702_UNSUPPORTED', unsupported);
  }
  console.log(JSON.stringify(results, null, 2));
  const ok = results.every((r) => r.pass);
  console.log(ok ? '\nALL TESTS PASS' : '\nSOME TESTS FAILED');
  process.exitCode = ok ? 0 : 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

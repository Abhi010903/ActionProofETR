import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  computeCommitment,
  SchemaValidationError,
} from '../../src/canonical/index.js';
import { serializeCanonicalToRpcPayload } from '../../src/canonical/serializer.js';
import { createImmutableSnapshot } from '../../src/provider/snapshot.js';

const USER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
const DATA = '0x04e45aaf000000000000000000000000' as const;

describe('Canonical Transaction Request & Commitment', () => {
  it('canonicalizes normal type-2 transaction with standard fields', () => {
    const tx = {
      from: USER,
      to: ROUTER,
      value: '0x0',
      data: DATA,
      chainId: 1,
      type: '0x2',
      maxFeePerGas: '0x3b9aca00',
      maxPriorityFeePerGas: '0x3b9aca00',
      nonce: '0x5',
      gas: '0x5208',
    };

    const commitment = computeCommitment(tx, 1);
    expect(commitment.canonical.domain).toBe('actionproof.request.v1');
    expect(commitment.canonical.type).toBe('0x2');
    expect(commitment.canonical.from).toBe(USER);
    expect(commitment.canonical.to).toBe(ROUTER);
    expect(commitment.canonical.value).toBe('0x0');
    expect(commitment.canonical.data).toBe(DATA);
    expect(commitment.canonical.chainId).toBe(1);
    expect(commitment.canonical.nonce).toBe('0x5');
    expect(commitment.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('Test 6: Semantically equivalent normalization produces identical commitments', () => {
    const a = computeCommitment({
      from: USER.toUpperCase(),
      to: ROUTER,
      data: DATA,
      chainId: 1,
      type: '0x2',
    });

    const b = computeCommitment({
      from: USER,
      to: ROUTER.toUpperCase(),
      value: '0x0',
      data: DATA.toUpperCase(),
      chainId: 1,
      type: '0x2',
    });

    const c = computeCommitment({
      from: USER,
      to: ROUTER,
      value: '0x00', // Redundant leading zeroes normalized away
      data: DATA,
      chainId: 1,
      type: '0x2',
    });

    expect(a.hash).toBe(b.hash);
    expect(b.hash).toBe(c.hash);
  });

  it('Test 8: Rejects unknown transaction properties', () => {
    expect(() => {
      computeCommitment({
        from: USER,
        to: ROUTER,
        data: DATA,
        chainId: 1,
        unexpectedProperty: 'malicious_payload',
      });
    }).toThrowError(SchemaValidationError);

    try {
      computeCommitment({
        from: USER,
        to: ROUTER,
        data: DATA,
        chainId: 1,
        unknownKey: 123,
      });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SchemaValidationError);
      expect((err as SchemaValidationError).code).toBe('UNKNOWN_FIELD:unknownKey');
    }
  });

  it('Test 11: Rejects EIP-7702 authorization list as UNSUPPORTED', () => {
    try {
      computeCommitment({
        from: USER,
        to: ROUTER,
        data: DATA,
        chainId: 1,
        authorizationList: [],
      });
      expect.unreachable();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SchemaValidationError);
      expect((err as SchemaValidationError).code).toBe('UNSUPPORTED_FIELD:authorizationList');
    }
  });

  it('Rejects blob transaction fields as UNSUPPORTED', () => {
    try {
      computeCommitment({
        from: USER,
        to: ROUTER,
        data: DATA,
        chainId: 1,
        maxFeePerBlobGas: '0x10',
      });
      expect.unreachable();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SchemaValidationError);
      expect((err as SchemaValidationError).code).toBe('UNSUPPORTED_FIELD:maxFeePerBlobGas');
    }
  });

  it('Rejects contract creation (omitted "to") as UNSUPPORTED in MVP', () => {
    try {
      computeCommitment({
        from: USER,
        data: DATA,
        chainId: 1,
      });
      expect.unreachable();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SchemaValidationError);
      expect((err as SchemaValidationError).code).toBe('UNSUPPORTED_CONTRACT_CREATION');
    }
  });

  it('Enforces chain ID consistency with active provider context', () => {
    expect(() => {
      computeCommitment({
        from: USER,
        to: ROUTER,
        data: DATA,
        chainId: 137, // Polygon chain ID on Ethereum Mainnet proxy
      }, 1);
    }).toThrowError(/CHAIN_MISMATCH/);
  });

  it('Resolves omitted chainId from active provider context', () => {
    const commitment = computeCommitment({
      from: USER,
      to: ROUTER,
      data: DATA,
    }, 1);
    expect(commitment.canonical.chainId).toBe(1);
  });

  it('Adversarial Reflection: Rejects non-enumerable injected unknown property', () => {
    const tx: Record<string, unknown> = {
      from: USER,
      to: ROUTER,
      data: DATA,
      chainId: 1,
    };
    Object.defineProperty(tx, 'hiddenMaliciousField', {
      value: '0x123',
      enumerable: false,
    });

    expect(() => computeCommitment(tx, 1)).toThrowError(/UNKNOWN_FIELD:hiddenMaliciousField/);
  });

  it('Adversarial Reflection: Rejects symbol injected property', () => {
    const tx: Record<string | symbol, unknown> = {
      from: USER,
      to: ROUTER,
      data: DATA,
      chainId: 1,
    };
    tx[Symbol('hiddenAttack')] = '0x123';

    expect(() => computeCommitment(tx, 1)).toThrowError(/UNKNOWN_FIELD:Symbol\(hiddenAttack\)/);
  });

  it('Adversarial Injection: Rejects unsupported field even if value is undefined', () => {
    const tx = {
      from: USER,
      to: ROUTER,
      data: DATA,
      chainId: 1,
      authorizationList: undefined,
    };

    expect(() => computeCommitment(tx, 1)).toThrowError(/UNSUPPORTED_FIELD:authorizationList/);
  });

  it('BigInt Handling: Correctly normalizes and commits transaction with bigint values', () => {
    const tx = {
      from: USER,
      to: ROUTER,
      value: 1000000000000000000n, // 1 ETH
      data: DATA,
      chainId: 1,
    };

    const commitment = computeCommitment(tx, 1);
    expect(commitment.canonical.value).toBe('0xde0b6b3a7640000');
  });

  it('Snapshot Integrity: Detects circular references and fails closed', () => {
    const tx: Record<string, unknown> = {
      from: USER,
      to: ROUTER,
      data: DATA,
      chainId: 1,
    };
    tx.self = tx;

    expect(() => createImmutableSnapshot(tx)).toThrowError(/CIRCULAR_REFERENCE/);
  });

  it('Snapshot Isolation: Aggressive mutation of original object and nested arrays leaves snapshot unaffected and frozen', () => {
    const storageKeys: string[] = ['0x0000000000000000000000000000000000000000000000000000000000000001'];
    const accessList: Array<{ address: string; storageKeys: string[] }> = [{ address: ROUTER, storageKeys }];
    const original: {
      from: string;
      to: string;
      data: string;
      chainId: number;
      type: string;
      accessList: Array<{ address: string; storageKeys: string[] }>;
    } = {
      from: USER,
      to: ROUTER,
      data: DATA,
      chainId: 1,
      type: '0x1',
      accessList,
    };

    const snapshot = createImmutableSnapshot(original);

    // Aggressively mutate original object and nested arrays
    original.to = '0xe64ba38a4b958c72bc0d421150ba464636422485';
    accessList.push({ address: '0xe64ba38a4b958c72bc0d421150ba464636422485', storageKeys: [] });
    storageKeys.push('0x0000000000000000000000000000000000000000000000000000000000000009');

    // Snapshot remains pristine and frozen
    expect(snapshot.to).toBe(ROUTER);
    expect(snapshot.accessList.length).toBe(1);
    expect(snapshot.accessList[0].storageKeys.length).toBe(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.accessList)).toBe(true);
    expect(Object.isFrozen(snapshot.accessList[0])).toBe(true);
    expect(Object.isFrozen(snapshot.accessList[0].storageKeys)).toBe(true);
  });

  describe('M1: Prototype Pollution & Prototype Hardening', () => {
    it('M1-1: Object with __proto__ own property is rejected by schema validator', () => {
      const maliciousTx = JSON.parse('{"__proto__":{"polluted":true},"from":"0x04f8996da763b7a969b1028ee3007569eaf3a635","to":"0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45","data":"0x"}');
      expect(() => computeCommitment(maliciousTx, 1)).toThrowError(SchemaValidationError);
      try {
        computeCommitment(maliciousTx, 1);
        expect.unreachable();
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(SchemaValidationError);
        expect((err as SchemaValidationError).code).toBe('PROTOTYPE_POLLUTION');
      }
    });

    it('M1-2: Object with custom prototype is rejected by schema validator', () => {
      class CustomRequest {
        from = USER;
        to = ROUTER;
        data = DATA;
        chainId = 1;
      }
      const customTx = new CustomRequest();
      expect(() => computeCommitment(customTx, 1)).toThrowError(SchemaValidationError);
      try {
        computeCommitment(customTx, 1);
        expect.unreachable();
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(SchemaValidationError);
        expect((err as SchemaValidationError).code).toBe('INVALID_PROTOTYPE');
      }
    });

    it('M1-3: Object.create(null) with valid fields is accepted and canonicalized', () => {
      const nullProtoTx: Record<string, unknown> = Object.create(null);
      nullProtoTx.from = USER;
      nullProtoTx.to = ROUTER;
      nullProtoTx.value = '0x0';
      nullProtoTx.data = DATA;
      nullProtoTx.chainId = 1;

      const commitment = computeCommitment(nullProtoTx, 1);
      expect(commitment.canonical.from).toBe(USER);
      expect(commitment.canonical.to).toBe(ROUTER);
      expect(commitment.hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('M1-4: createImmutableSnapshot rejects prototype pollution attempts and isolates prototype chain', () => {
      // 1. Rejects own __proto__
      const maliciousOwnProto = JSON.parse('{"__proto__":{"polluted":true},"from":"0x123"}');
      expect(() => createImmutableSnapshot(maliciousOwnProto)).toThrowError(/PROTOTYPE_POLLUTION/);

      // 2. Rejects custom prototype
      const customProtoObj = Object.create({ malicious: true });
      customProtoObj.from = USER;
      expect(() => createImmutableSnapshot(customProtoObj)).toThrowError(/INVALID_PROTOTYPE/);

      // 3. Cloned object has null prototype and cannot inherit from Object.prototype
      const validTx = { from: USER, to: ROUTER, data: DATA, chainId: 1 };
      const snap = createImmutableSnapshot(validTx);
      expect(Object.getPrototypeOf(snap)).toBeNull();
    });
  });

  describe('M2: Canonical RPC Payload Serialization', () => {
    it('M2-1: serializeCanonicalToRpcPayload produces expected fields', () => {
      const canonical = canonicalize({
        from: USER,
        to: ROUTER,
        value: '0x10',
        data: DATA,
        chainId: 1,
        type: '0x2',
        nonce: '0x1',
        gas: '0x5208',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
        accessList: [{ address: USER, storageKeys: ['0x0000000000000000000000000000000000000000000000000000000000000001'] }],
      }, 1);

      const rpcPayload = serializeCanonicalToRpcPayload(canonical);
      expect(rpcPayload.from).toBe(USER);
      expect(rpcPayload.to).toBe(ROUTER);
      expect(rpcPayload.value).toBe('0x10');
      expect(rpcPayload.data).toBe(DATA.toLowerCase());
      expect(rpcPayload.chainId).toBe(1);
      expect(rpcPayload.type).toBe('0x2');
      expect(rpcPayload.nonce).toBe('0x1');
      expect(rpcPayload.gas).toBe('0x5208');
      expect(rpcPayload.maxFeePerGas).toBe('0x3b9aca00');
      expect(rpcPayload.maxPriorityFeePerGas).toBe('0x3b9aca00');
      expect(Array.isArray(rpcPayload.accessList)).toBe(true);
    });

    it('M2-2: All quantities are normalized 0x-hex strings and chainId is number', () => {
      const canonical = canonicalize({
        from: USER,
        to: ROUTER,
        value: 0,
        chainId: 1,
      }, 1);

      const rpcPayload = serializeCanonicalToRpcPayload(canonical);
      expect(rpcPayload.value).toBe('0x0');
      expect(rpcPayload.chainId).toBe(1);
      expect(typeof rpcPayload.chainId).toBe('number');
    });

    it('M2-3: Empty calldata is serialized as exactly 0x', () => {
      const canonical = canonicalize({
        from: USER,
        to: ROUTER,
        chainId: 1,
      }, 1);

      const rpcPayload = serializeCanonicalToRpcPayload(canonical);
      expect(rpcPayload.data).toBe('0x');
    });

    it('M2-4: Mixed-case addresses are normalized to canonical lowercase', () => {
      const mixedUser = '0x04F8996DA763B7A969B1028EE3007569EAF3A635';
      const mixedRouter = '0x68B3465833FB72A70ECDF485E0E4C7BD8665FC45';
      const canonical = canonicalize({
        from: mixedUser,
        to: mixedRouter,
        chainId: 1,
      }, 1);

      const rpcPayload = serializeCanonicalToRpcPayload(canonical);
      expect(rpcPayload.from).toBe(USER);
      expect(rpcPayload.to).toBe(ROUTER);
    });
  });
});

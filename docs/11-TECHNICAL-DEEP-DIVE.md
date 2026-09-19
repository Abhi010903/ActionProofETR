# ActionProof — Technical Deep Dive: Canonicalization, Freezing & Determinism

## 1. The `actionproof.request.v1` Canonical Schema

To prevent semantic drift, serialization malleability, and parameter spoofing, ActionProof defines a strict canonical normalization standard: `actionproof.request.v1`.

### 1.1. Field Whitelist and Type Constraints

Only the following fields are permitted in a standard Ethereum transaction request:

```typescript
export interface CanonicalTransactionRequest {
  readonly domain: 'actionproof.request.v1';
  readonly type: SupportedTransactionType; // '0x0' | '0x1' | '0x2'
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: `0x${string}`;
  readonly data: `0x${string}`;
  readonly chainId: number;
  readonly nonce: `0x${string}` | null;
  readonly gas: `0x${string}` | null;
  readonly gasPrice: `0x${string}` | null;
  readonly maxFeePerGas: `0x${string}` | null;
  readonly maxPriorityFeePerGas: `0x${string}` | null;
  readonly accessList: readonly AccessListEntry[];
}
```

Any unknown or unexpected fields (such as `authorizationList`, `blobs`, or extraneous keys) cause canonical validation to fail immediately.

---

## 2. Normalization Rules

### 2.1. Address Normalization
* Addresses must be strictly validated as 20-byte hexadecimal strings prefixed with `0x`.
* Case is stripped: all hex characters (`A-F`) are normalized to lowercase (`a-f`).
* Checksum encoding is rejected or stripped during canonical conversion to ensure identical hashes for identical addresses.

### 2.2. Quantity & Value Normalization
* Decimals, strings, and BigInts are normalized into canonical lowercase hex representations.
* Redundant leading zeroes are removed (e.g., `0x000001a` $\rightarrow$ `0x1a`).
* Zero is uniquely represented as `"0x0"`.

### 2.3. Access List Sorting
Access lists allow transactions to specify storage warm-up slots. Because JSON objects and arrays preserve insertion order, adversaries could generate different hashes for identical access lists simply by reordering keys. ActionProof enforces:
1. `accessList` entries are sorted lexicographically by `address` (lowercase).
2. Within each entry, `storageKeys` are sorted lexicographically (lowercase).

```typescript
export function normalizeAccessList(accessList: unknown[]): CanonicalAccessList {
  return accessList
    .map(entry => ({
      address: normalizeAddress(entry.address),
      storageKeys: [...entry.storageKeys].map(normalizeHex).sort()
    }))
    .sort((a, b) => a.address.localeCompare(b.address));
}
```

---

## 3. Anti-Accessor Deep Freezing Algorithm

JavaScript's dynamic object model allows properties to be defined as getters or wrapped in `Proxy` objects:

```typescript
// Malicious dynamic getter
let count = 0;
const hostile = {
  get data() { return count++ === 0 ? "0xBenign" : "0xDrain"; }
};
```

If a security tool reads `request.data` during verification and the wallet reads `request.data` during dispatch, the getter executes twice with different outputs.

### ActionProof's Disarmament Strategy:
1. **Single-Pass Evaluation:** The object is traversed once. Each property is read exactly once using `Object.getOwnPropertyDescriptor()` and cached into a local primitive variable.
2. **Defensive Cloning:** A new object is created with a `null` prototype (`Object.create(null)`), preventing prototype poisoning attacks.
3. **BigInt-Safe Recursive Freezing:** All nested arrays and sub-objects are recursively frozen using `Object.freeze()`. BigInt values are preserved cleanly without throwing serialization exceptions.

---

## 4. Deterministic Commitment Hashing

To produce an unforgeable, collision-resistant commitment hash:
1. The request is normalized into a `CanonicalTransactionRequest` (`domain: 'actionproof.request.v1'`).
2. The object is serialized into a deterministic, fixed-order UTF-8 JSON string via `serializeCanonicalRequest()` in `src/canonical/serializer.ts`.
3. The byte buffer is hashed using standard Ethereum Keccak-256 via `keccak256(stringToBytes(serialized))` from `viem`.

```typescript
// src/canonical/commitment.ts
export function computeCommitment(tx: unknown, activeChainId = 1): RequestCommitment {
  const canonical = canonicalize(tx, activeChainId);
  const serialized = serializeCanonicalRequest(canonical);
  const hash = keccak256(stringToBytes(serialized));

  return {
    canonical,
    serialized,
    hash,
  };
}
```

Because every step of this pipeline is deterministic, two identical transaction requests will produce the exact same 66-character (`0x` + 64 hex characters) Keccak-256 commitment, regardless of browser engine, key insertion order, or memory layout.

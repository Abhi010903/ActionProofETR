# ActionProof — Technical Deep Dive: Canonicalization, Freezing & Determinism

## 1. The `actionproof.request.v1` Canonical Schema

To prevent semantic drift, serialization malleability, and parameter spoofing, ActionProof defines a strict canonical normalization standard: `actionproof.request.v1`.

### 1.1. Field Whitelist and Type Constraints

Only the following fields are permitted in a standard Ethereum transaction request:

```typescript
export interface CanonicalTransactionRequest {
  readonly schemaVersion: "actionproof.request.v1";
  readonly to: string | null;           // Lowercase 0x + 40 hex chars, or null for deployment
  readonly from?: string;               // Lowercase 0x + 40 hex chars
  readonly data: string;                // Lowercase 0x-prefixed hex string (even length)
  readonly value: string;               // Lowercase hex integer, no leading zeros (e.g. "0x0", "0xde0b6b3a7640000")
  readonly chainId?: number;            // Integer
  readonly nonce?: number;              // Integer
  readonly gas?: string;                // Lowercase hex integer
  readonly maxFeePerGas?: string;       // Lowercase hex integer
  readonly maxPriorityFeePerGas?: string; // Lowercase hex integer
  readonly accessList?: ReadonlyArray<{ // Deterministically sorted
    readonly address: string;
    readonly storageKeys: ReadonlyArray<string>;
  }>;
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
1. The canonical object's keys are sorted in alphabetical order.
2. The object is serialized to JSON with deterministic indentation and whitespace.
3. The byte buffer is hashed using SHA-256.

```typescript
export function computeCommitment(canonical: CanonicalTransactionRequest): string {
  const sortedKeys = Object.keys(canonical).sort();
  const canonicalEntries = sortedKeys.map(key => [key, canonical[key as keyof CanonicalTransactionRequest]]);
  const serialized = JSON.stringify(Object.fromEntries(canonicalEntries));
  
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}
```

Because every step of this pipeline is deterministic, two identical transaction requests will produce the exact same 64-character hex commitment, regardless of browser engine, key insertion order, or memory layout.

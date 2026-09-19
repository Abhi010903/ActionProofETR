# ActionProof — Level-2 Provider Request Binding & Tamper Resistance

## 1. The Level-2 Provider Binding Architecture

```mermaid
flowchart LR
    subgraph DApp In-Memory Space
        Req["Mutable Request Object<br/>{ to, data, value }"]
    end

    subgraph ActionProof Proxy
        Snap["Snapshot & Deep Freeze<br/>(Getters executed, references severed)"]
        Canon1["Canonicalize<br/>(actionproof.request.v1)"]
        Hash1["Verified Commitment<br/>Keccak-256 (C_verified)"]
        
        Eval["Evidence Collection &<br/>Policy Decision (VERIFIED)"]

        Barrier{"Pre-Forward Recheck<br/>Re-Canonicalize Outgoing Snapshot"}
        Hash2["Forward Commitment<br/>Keccak-256 (C_fwd)"]
        Check{"C_fwd == C_verified ?"}
    end

    subgraph Wallet Interface
        Forward["underlyingProvider.request(...)"]
    end

    Req -->|"Intercepted"| Snap
    Snap --> Canon1 --> Hash1
    Hash1 --> Eval --> Barrier
    Barrier -->|"Payload about to dispatch"| Hash2
    Hash1 & Hash2 --> Check
    Check -->|"YES (Match)"| Forward
    Check -->|"NO (Mismatch)"| Halt["HALT: COMMITMENT_MISMATCH<br/>(Wallet NEVER Called)"]
```

---

## 2. The Formal Binding Invariant

The ActionProof Level-2 Provider Binding Invariant is defined as:

$$\forall T \in \text{Transactions}, \quad \text{Dispatch}(T_{\text{fwd}}) \iff \mathcal{H}(\mathcal{N}(T_{\text{fwd}})) \equiv \mathcal{C}_{\text{verified}}$$

Where:
* $\mathcal{N}(x)$ is the canonical normalization function under the strict `actionproof.request.v1` schema domain (`src/canonical/commitment.ts`).
* $\mathcal{H}(x)$ is the deterministic Ethereum Keccak-256 serialization and hashing function via `viem` `keccak256(stringToBytes(serialized))`.
* $\mathcal{C}_{\text{verified}}$ is the cryptographic commitment produced during initial snapshot analysis.
* $T_{\text{fwd}}$ is the payload object forwarded to `underlyingProvider.request()`.

If any condition results in $\mathcal{H}(\mathcal{N}(T_{\text{fwd}})) \neq \mathcal{C}_{\text{verified}}$, the transaction dispatch is aborted, the promise is rejected, and the underlying wallet is never called.

---

## 3. Anti-Tamper & Anti-Accessor Hardening

In dynamic JavaScript environments, an adversary can attempt to subvert verification through several runtime vectors:

### 3.1. Dynamic Property Getters
```typescript
// Exploit Pattern: Return benign value to ActionProof, malicious value to wallet
let readCount = 0;
const payload = {
  get to() {
    return (readCount++ === 0) 
      ? "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" // Uniswap
      : "0xAttackerContract000000000000000000000000"; // Attacker
  }
};
```
**ActionProof Defense:**  
`createImmutableSnapshot()` (`src/provider/snapshot.ts`) accesses each property exactly once during the initial snapshot, copying the primitive value into a brand-new object created via `Object.create(null)`. The object is then deeply frozen using `Object.freeze()`. Dynamic getters cannot re-execute.

### 3.2. Reference Mutation (TOCTOU)
```typescript
// Exploit Pattern: Mutate properties after verification has passed
const payload = { to: uniswapRouter, data: swapData };
const promise = provider.request({ method: "eth_sendTransaction", params: [payload] });
// Background timer or microtask mutates destination
payload.to = attackerAddress;
```
**ActionProof Defense:**  
1. ActionProof discards the original userland object reference and performs all verification on its frozen internal snapshot.
2. The payload passed to the underlying wallet is derived from a freshly created immutable forward snapshot immediately prior to pre-forward recheck.
3. If an attacker manages to tamper with the outgoing parameter object, the pre-forward recheck in `ActionProofProviderProxy.executeSendTransaction()` catches the hash mismatch and halts execution.

### 3.3. Nested Object Mutation & Prototype Pollution
Objects containing nested structures (such as `accessList` arrays containing address and storage key tuples) are recursively cloned and frozen. Prototype chains are sanitized, preventing prototype pollution attacks on `Object.prototype`.

---

## 4. Pre-Forward Commitment Recheck Implementation

The pre-forward commitment recheck is executed in-line within `ActionProofProviderProxy.executeSendTransaction()` in [`src/provider/proxy.ts`](file:///C:/Coding/Projects/Crypto_Fair/src/provider/proxy.ts):

```typescript
// 4. Create an immutable verified forwarding snapshot immediately prior to pre-forward recheck.
let forwardPayload: Record<string, unknown>;
try {
  forwardPayload = createImmutableSnapshot(liveRequest) as Record<string, unknown>;
  validateRequestShape(forwardPayload);
} catch (err: unknown) {
  return {
    verdict: 'BLOCKED',
    txHash: null,
    reason: 'UNCANONICALIZABLE_FORWARD_REQUEST',
    // ...
  };
}

// 5. Pre-forward recheck: immediately recompute commitment on the exact snapshot about to be forwarded
const forwardCommitment = computeCommitment(forwardPayload, this.activeChainId);

// Strict commitment equality invariant
if (forwardCommitment.hash !== verifiedCommitment.hash) {
  evidence.binding.status = 'MISMATCH';
  evidence.binding.forwardCommitment = forwardCommitment.hash;
  evidence.policy.verdict = 'BLOCKED';

  return {
    verdict: 'BLOCKED',
    txHash: null,
    reason: 'COMMITMENT_MISMATCH',
    detail: `Verified [${verifiedCommitment.hash.slice(0, 10)}...] != Forward [${forwardCommitment.hash.slice(0, 10)}...]`,
    commitment: verifiedCommitment.hash,
    forwardCommitment: forwardCommitment.hash,
    evidence,
    blockedBeforeForwarding: true,
  };
}
}
```

This ensures that under no circumstances can an altered request be transmitted to the underlying wallet.

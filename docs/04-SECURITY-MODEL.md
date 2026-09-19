# ActionProof — Security Model & Trust Boundaries

## 1. The Threat Environment & Trust Assumptions

ActionProof operates in an adversarial client runtime. The browser environment is inherently hostile: third-party scripts, malicious extensions, compromised CDN dependencies, and prototype pollution attacks can all compromise runtime data integrity.

### 1.1. Categorization of Trust

| Component / Artifact | Trust Level | Security Handling in ActionProof |
| :--- | :--- | :--- |
| **DApp UI Text & Claims** | **UNTRUSTED** | Recorded as client intent assertions. Never used as ground truth for authorization. |
| **Raw Request Object (`tx`)** | **ADVERSARIAL** | Deep-frozen immediately upon receipt to neutralise in-memory tampering and getters. |
| **Contract Bytecode & ABIs** | **INDEPENDENT / VERIFIED** | Sourced via verified registries (Sourcify) and built-in trusted ABIs. |
| **Execution Simulation** | **ADVISORY EVIDENCE** | Evaluated with explicit provenance tracking (`LOCAL_FIXTURE` vs `LIVE_RPC`). |
| **Underlying Wallet** | **ASSUMED HONEST (EIP-1193)** | Relied upon to execute what is forwarded across the EIP-1193 interface. |

---

## 2. Security Tiers & Binding Guarantees

ActionProof defines three distinct levels of transaction authorization security:

```
+-------------------------------------------------------------------------+
| Level 1: Advisory Analysis (Industry Baseline)                          |
| Scanner inspects request -> Shows popup -> User clicks OK -> Forwards   |
| Vulnerability: Post-check in-memory mutation (TOCTOU).                  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Level 2: Provider Request Binding (ACTIONPROOF MVP CORE)                |
| Invariant: Forwarded request is canonical-equivalent to verified        |
| request. Enforced by pre-forward cryptographic commitment barrier.     |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Level 3: Hardware Signing Payload Binding (Future / Internal Wallet)    |
| Invariant: RLP-encoded bytes signed by secure enclave match verified    |
| request. Requires wallet-internal integration; NOT claimed by MVP.      |
+-------------------------------------------------------------------------+
```

### 2.1. Level-2 Security Invariant (ActionProof MVP Core Claim)

The formal security claim of the ActionProof MVP is:

> **Level-2 Invariant:**  
> *"Within an integration where ActionProof owns the EIP-1193 provider path to the wallet, the immutable forwarded transaction request is canonical-equivalent to the request whose commitment was verified under the `actionproof.request.v1` schema."*

To satisfy this invariant, ActionProof enforces:
1. **Immediate Deep-Freezing:** The transaction parameters are snapshotted into an immutable data structure using `Object.freeze` and defensive cloning, breaking all references to userland objects.
2. **Getter Disarmament:** All property getters are evaluated at snapshot creation time. Subsequent getter invocations cannot return altered values.
3. **Canonical Normalization:** The snapshot is normalized into a strictly typed canonical format (`actionproof.request.v1`), sorting access lists, normalizing addresses, and standardizing hexadecimal integers.
4. **Commitment Hashing:** A SHA-256 hash of the canonically serialized snapshot is generated:
   $$\mathcal{C}_{\text{verified}} = \text{SHA256}(\text{CanonicalSerialize}(S))$$
5. **Pre-Forward Barrier:** Before passing the request to the underlying wallet, the barrier takes the exact forwarded argument $T_{\text{fwd}}$, canonicalizes it, and re-computes:
   $$\mathcal{C}_{\text{fwd}} = \text{SHA256}(\text{CanonicalSerialize}(T_{\text{fwd}}))$$
   If $\mathcal{C}_{\text{fwd}} \neq \mathcal{C}_{\text{verified}}$, execution is aborted with `COMMITMENT_MISMATCH`.

### 2.2. Honest Boundaries: Why Level-3 Is Not Claimed

ActionProof adheres to rigorous security honesty:

* **Level-3 Limitation:** An external provider proxy operating at the EIP-1193 interface **cannot cryptographically prove** what the wallet's internal firmware or secure enclave signs. 
* A compromised wallet, or an attacker who bypasses `window.ethereum` to communicate directly with an RPC node, operates outside the provider boundary.
* Level-3 binding requires modifications to the wallet's internal signing pipeline. ActionProof honestly marks Level-3 as **OUT OF SCOPE / NOT PROVEN** for an external EIP-1193 proxy.

---

## 3. Fail-Closed Security Posture

ActionProof enforces a strict **fail-closed** paradigm. When transaction parameters cannot be definitively verified, the default action is to **BLOCK**:

1. **Unknown Calldata:** If calldata does not match any recognized ABI selector and cannot be safely unrolled or verified, ActionProof blocks the request (`BLOCKED / UNKNOWN_CALLDATA`). It never defaults to `VERIFIED` on unknown bytes.
2. **Unsupported Transaction Types:** If a request contains EIP-7702 delegation fields (`authorizationList`) or EIP-4844 blob fields (`blobs`, `blobVersionedHashes`), ActionProof halts with `UNSUPPORTED`.
3. **Commitment Mismatch:** Any difference between the verified snapshot and the forwarded request results in an immediate exception.

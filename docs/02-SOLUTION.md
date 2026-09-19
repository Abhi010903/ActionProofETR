# ActionProof — Solution Architecture: The 4 Core Security Questions

## 1. The ActionProof Security Paradigm

ActionProof is a deterministic, client-side pre-signing security verification gate for Ethereum. It sits directly between the decentralized application (DApp) and the user's Web3 wallet at the standard **EIP-1193** provider boundary.

Unlike advisory extensions that passively display popups or rely on non-deterministic language models, ActionProof operates as an **enforcing transaction barrier**. If a transaction request fails cryptographic commitment checks, contains hidden stealth approvals, exhibits unknown/un-decodable calldata, or attempts to exploit unsupported transaction schemas, **ActionProof halts execution and blocks the request before it reaches the wallet confirmation screen.**

```
+-------------------------------------------------------------------------+
|                                  DApp                                   |
+-------------------------------------------------------------------------+
                                     |
                         eth_sendTransaction(tx)
                                     v
+-------------------------------------------------------------------------+
|                    ActionProof EIP-1193 Provider Proxy                  |
|                                                                         |
|  [Step 1: Deep Freeze & Snapshot]                                       |
|  [Step 2: Canonical Normalization (actionproof.request.v1)]             |
|  [Step 3: Cryptographic Commitment Hash Generation]                     |
|  [Step 4: Independent Evidence Pipeline & Multicall Analysis]           |
|  [Step 5: Deterministic Policy Evaluation]                              |
|  [Step 6: Pre-Forward Commitment Re-verification Barrier]               |
+-------------------------------------------------------------------------+
             |                                             |
    (BLOCKED / FAIL-CLOSED)                         (VERIFIED / PASS)
             v                                             v
+-------------------------+                   +---------------------------+
| User Interface Warning  |                   | Underlying Wallet (Meta-  |
| & Zero Wallet Dispatch  |                   | Mask, Rabby, Hardware)    |
+-------------------------+                   +---------------------------+
```

---

## 2. Resolving the Four Core Security Questions

To guarantee absolute transaction safety, ActionProof formulates and answers four fundamental security questions for every single transaction request:

### Question 1: What Does the Application Claim?
* **Origin:** The DApp's frontend UI, intent metadata, or user action description.
* **Security Status:** **UNTRUSTED CLIENT CLAIM.**
* **ActionProof Treatment:** The frontend's textual claims (e.g. *"Swap 100 USDC for ETH"*) are recorded as intent evidence, but are explicitly marked as untrusted. They are never trusted as proof of what the transaction actually executes.

### Question 2: What Is the Raw Transaction Request?
* **Origin:** The arguments passed to `window.ethereum.request({ method: "eth_sendTransaction", params: [tx] })`.
* **Security Status:** **MUTABLE IN-MEMORY OBJECT (HIGH RISK).**
* **ActionProof Treatment:** 
  1. Immediately deep-freezes the request into an immutable snapshot, breaking all object references and disarming hostile getter traps.
  2. Parses the request under a strict, whitelisted canonical schema (`actionproof.request.v1`).
  3. Generates a deterministic, Ethereum Keccak-256 canonical commitment hash:
     $$\text{Commitment} = \text{Keccak256}(\text{CanonicalSerialization}(\text{snapshot}))$$

### Question 3: What Does the Transaction Actually Do?
* **Origin:** Independent on-chain and contract evidence pipelines.
* **Security Status:** **VERIFIABLE MACHINE-CHECKED EVIDENCE.**
* **ActionProof Treatment:**
  - **Independent ABI Decoding:** Decodes the function selector and parameters without trusting DApp-provided ABIs.
  - **Recursive Multicall Inspection (`RULE_03`):** Recursively unpacks nested subcalls (e.g. `Multicall3.aggregate3`, `SwapRouter02.multicall`) to uncover hidden transfer or approval operations.
  - **Application Intent Contradiction Detection (`RULE_04`):** Evaluates declared application intent categories (`SWAP`, `TRANSFER`, `SEND`, `PAYMENT`, `APPROVAL`, `CLAIM`) against independently decoded action categories (`APPROVE`, `TRANSFER`, `TRANSFER_FROM`, `SWAP`, `UNKNOWN`). Blocks obvious contradictions (e.g. `SWAP` + `approve`, `TRANSFER` + `approve`, `APPROVAL` + `swap`, `SWAP` + `transfer`) using deterministic keyword/category matching (zero NLP or LLM semantic heuristics). Non-contradictory matching operations (`TRANSFER` + `transfer`, `SWAP` + recognized swap) pass, while `CLAIM` + `transferFrom` remains outside the contradiction matrix without being falsely classified as safe. Custom/unsupported UI language passes without claiming verified intent.
  - **Contract Identity Verification:** Checks contract bytecode and metadata via Sourcify/verification registries (`LOCAL_FIXTURE` provenance).
  - **ERC-7730 Intent Descriptors:** Maps contract parameters to human-readable intent schemas.
  - **Execution Simulation:** Analyzes predicted state changes, balance deltas, and asset transfers with explicit provenance tracking.

### Question 4: Is the Forwarded Request Identical to What Was Verified?
* **Origin:** The actual argument dispatched to `underlyingProvider.request(...)`.
* **Security Status:** **THE LEVEL-2 BINDING INVARIANT.**
* **ActionProof Treatment:**
  - Immediately before dispatch inside `ActionProofProviderProxy.executeSendTransaction()`, an immutable forwarding snapshot is taken.
  - Re-canonicalizes and re-hashes the outgoing snapshot:
     $$\text{ForwardCommitment} = \text{Keccak256}(\text{CanonicalSerialization}(\text{forwardPayload}))$$
  - Re-checks: $\text{ForwardCommitment} \equiv \text{VerifiedCommitment}$.
  - If any in-memory mutation, prototype pollution, or reference tamper occurred, ActionProof throws `COMMITMENT_MISMATCH` and terminates forwarding before the wallet is called.

---

## 3. Core Architectural Principles

| Principle | ActionProof Implementation |
| :--- | :--- |
| **Deterministic Policy** | Zero probabilistic AI inference in the evaluation loop. All policy rules are deterministic mathematical checks over canonical evidence. |
| **Fail-Closed Gate** | Unknown calldata, unsupported fields (EIP-7702, blob transactions), or missing signatures trigger immediate blocking. |
| **Tamper-Proof Binding** | Canonical hashing under `actionproof.request.v1` guarantees that the analyzed request matches the forwarded request. |
| **Honest Provenance** | The provenance of all evidence is tracked (`INDEPENDENT`, `VERIFIED_REGISTRY`, `LOCAL_FIXTURE`, `UNTRUSTED_DAPP`). Evaluators and users are never misled. |
| **Pre-Wallet Enforcement** | Blocking occurs *before* wallet confirmation, eliminating confirmation fatigue and user social-engineering attacks. |

---

## 4. Scope and Integration Boundary

* **Level-1 (Advisory Warning):** User is warned of risks, but wallet forwarding proceeds regardless. (Insufficient for robust security).
* **Level-2 (Request Binding Enforcement — ACTIONPROOF MVP):** Proves and enforces that the request forwarded across EIP-1193 is cryptographically identical to the request verified.
* **Level-3 (Cryptographic Signing Payload Binding):** Proves that the hardware or secure enclave signature matches the request. This requires wallet-internal implementation and is honestly designated as out of scope for an external provider proxy.

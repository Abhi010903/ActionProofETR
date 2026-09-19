# ActionProof — Threat Model & Attack Matrix

## 1. Attack-Defense Hierarchy Diagram

```mermaid
flowchart TD
    subgraph Adversary Attack Vectors
        A1["1. Deceptive UI Claim<br/>(DApp claims swap, payload steals tokens)"]
        A2["2. Stealth Multicall<br/>(Bundles unlimited approval inside swap batch)"]
        A3["3. In-Memory TOCTOU Tamper<br/>(Mutates 'to' or 'data' after scan)"]
        A4["4. Unknown Calldata Exploit<br/>(Obfuscates malicious bytes behind custom selector)"]
        A5["5. EIP-7702 Write Bypass<br/>(Injects authorizationList to hijack EOA code)"]
        A6["6. Direct RPC Bypass<br/>(Adversary circumvents window.ethereum)"]
    end

    subgraph ActionProof Detection & Mitigation
        D1["Independent Calldata Decoding & Verification"]
        D2["Recursive Multicall Inspector & Approval Detector"]
        D3["Deep Freeze Snapshot + Pre-Forward Barrier Recheck"]
        D4["Fail-Closed Unknown Calldata Rule"]
        D5["Strict Schema Whitelist (actionproof.request.v1)"]
        D6["Integration Boundary (Out of Proxy Scope)"]
    end

    subgraph Enforcement Action
        E1["BLOCKED (Claim Mismatch)"]
        E2["BLOCKED (Stealth Approval Detected)"]
        E3["BLOCKED (COMMITMENT_MISMATCH)"]
        E4["BLOCKED (UNKNOWN_CALLDATA)"]
        E5["BLOCKED (UNSUPPORTED_TYPE)"]
        E6["Limitation Documented"]
    end

    A1 --> D1 --> E1
    A2 --> D2 --> E2
    A3 --> D3 --> E3
    A4 --> D4 --> E4
    A5 --> D5 --> E5
    A6 --> D6 --> E6
```

---

## 2. Threat Matrix

| Threat ID | Threat Name | Adversary Technique | ActionProof Defense Mechanism | Severity | Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **THREAT-01** | **UI Deception / Phishing Claim** | Compromised frontend renders "Claim Rewards" while calldata calls `transferFrom(...)` or drains ETH. | Frontend text treated as **UNTRUSTED CLIENT CLAIM**. Calldata independently decoded and verified against registry. | Critical | **BLOCKED** |
| **THREAT-02** | **Stealth Multicall Approval** | Attacker batches a normal swap with `token.approve(attacker, MAX_UINT256)` inside `Multicall3.aggregate3`. | Multicall engine recursively unpacks nested call array. Policy engine detects unannounced approval. | Critical | **BLOCKED** |
| **THREAT-03** | **Post-Verification Mutation (TOCTOU)** | Hostile script modifies `tx.to` in the JavaScript heap after policy check passes, before wallet receives request. | Pre-forward barrier re-canonicalizes outgoing request and verifies $\mathcal{C}_{\text{fwd}} \equiv \mathcal{C}_{\text{verified}}$. | Critical | **COMMITMENT_ MISMATCH (BLOCKED)** |
| **THREAT-04** | **Getter / Proxy Trap Manipulation** | Attacker passes object with getter returning benign value on read #1 (scanner) and malicious value on read #2 (wallet). | `snapshotRequest()` invokes getters once, deep-clones values, and recursively calls `Object.freeze()`. | High | **BLOCKED / DEFUSED** |
| **THREAT-05** | **Unknown / Opaque Calldata** | Attacker submits unverified custom contract payload hoping scanner fails open or issues passive warning. | Strict **Fail-Closed** policy: unknown function selectors cannot produce `VERIFIED`. | High | **BLOCKED (UNKNOWN_CALLDATA)** |
| **THREAT-06** | **Unsupported Protocol Bypass (EIP-7702)** | Attacker submits Type-4 transaction with `authorizationList` to delegate EOA code to drainer contract. | Canonical validator checks schema whitelist. Any presence of `authorizationList` triggers fail-closed. | Critical | **UNSUPPORTED (BLOCKED)** |
| **THREAT-07** | **Direct Provider Bypass** | Hostile script bypasses `window.ethereum` and sends raw JSON-RPC directly to Infura/Alchemy or local node. | Outside EIP-1193 proxy scope. ActionProof protects the provider path it owns. | N/A | **OUT OF SCOPE** |

---

## 3. Defense-in-Depth Design

ActionProof implements defense-in-depth through orthogonal validation layers:
1. **Structural Validation:** Rejects any payload violating `actionproof.request.v1` schema.
2. **Cryptographic Validation:** Hashing ensures zero drift between evaluated payload and forwarded payload.
3. **Semantic Validation:** ABI decoding and multicall inspection ensure every execution step is fully understood.
4. **Behavioral Simulation:** Predicted state changes confirm real balance impacts before user authorization.

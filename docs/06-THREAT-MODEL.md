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
| **THREAT-01** | **UI Deception / Intent Contradiction** | Compromised frontend renders "Swap 100 USDC -> ETH" while calldata executes `approve(attacker, ...)` or `transfer(...)`. | Evaluates declared intent categories (`SWAP`, `TRANSFER`, `SEND`, `PAYMENT`, `APPROVAL`, `CLAIM`) against decoded action categories (`APPROVE`, `TRANSFER`, `TRANSFER_FROM`, `SWAP`, `UNKNOWN`) via deterministic `RULE_04`. Contradictions fail closed. | Critical | **BLOCKED (Deceptive UI Claim)** |
| **THREAT-02** | **Stealth Multicall Approval** | Attacker batches a normal swap with `token.approve(attacker, MAX_UINT256)` inside `Multicall3.aggregate3`. | Multicall engine recursively unpacks nested call array. Policy engine (`RULE_02A`, `RULE_03`, `RULE_04`) detects unannounced approval and dangerous subcalls. | Critical | **BLOCKED** |
| **THREAT-03** | **Post-Verification Mutation (TOCTOU)** | Hostile script modifies `tx.to` in the JavaScript heap after policy check passes, before wallet receives request. | In-line pre-forward recheck in `executeSendTransaction()` takes immutable snapshot, re-canonicalizes, and verifies $\mathcal{C}_{\text{fwd}} \equiv \mathcal{C}_{\text{verified}}$ via Keccak-256. | Critical | **COMMITMENT_ MISMATCH (BLOCKED)** |
| **THREAT-04** | **Getter / Proxy Trap Manipulation** | Attacker passes object with getter returning benign value on read #1 (scanner) and malicious value on read #2 (wallet). | `createImmutableSnapshot()` invokes getters once during single-pass extraction, deep-clones values into a null-prototype dictionary, and recursively freezes. | High | **BLOCKED / DEFUSED** |
| **THREAT-05** | **Unknown / Opaque Calldata** | Attacker submits unverified custom contract payload hoping scanner fails open or issues passive warning. | Strict **Fail-Closed** policy via `RULE_08`: unknown function selectors cannot produce `VERIFIED`. | High | **BLOCKED (UNKNOWN_CALLDATA)** |
| **THREAT-06** | **Unsupported Protocol Bypass (EIP-7702)** | Attacker submits Type-4 transaction with `authorizationList` to delegate EOA code to drainer contract. | Canonical validator checks schema whitelist (`SUPPORTED_KEYS`). Any presence of `authorizationList` or blobs triggers fail-closed `UNSUPPORTED`. | Critical | **UNSUPPORTED (BLOCKED)** |
| **THREAT-07** | **Direct Provider Bypass** | Hostile script bypasses `window.ethereum` and sends raw JSON-RPC directly to Infura/Alchemy or local node. | Outside EIP-1193 proxy scope. ActionProof protects the provider path it owns. | N/A | **OUT OF SCOPE** |

---

## 3. The RULE_04 Deterministic Contradiction Matrix

ActionProof rejects UI deception without relying on probabilistic NLP models or LLMs. It uses pure deterministic string keyword matching and category mapping:

| Declared Intent | Decoded Action | Result | Rationale |
| :--- | :--- | :--- | :--- |
| **`SWAP`** | `APPROVE` | **`BLOCKED`** | Contradiction: UI claimed swap, calldata approves spender. |
| **`SWAP`** | `TRANSFER` / `TRANSFER_FROM` | **`BLOCKED`** | Contradiction: UI claimed swap, calldata executes direct transfer. |
| **`TRANSFER` / `SEND` / `PAYMENT`** | `APPROVE` | **`BLOCKED`** | Contradiction: UI claimed payment/transfer, calldata approves spender. |
| **`TRANSFER` / `SEND` / `PAYMENT`** | `SWAP` | **`BLOCKED`** | Contradiction: UI claimed payment/transfer, calldata executes swap. |
| **`APPROVAL`** | `SWAP` | **`BLOCKED`** | Contradiction: UI claimed approval, calldata executes swap. |
| **`APPROVAL`** | `TRANSFER` / `TRANSFER_FROM` | **`BLOCKED`** | Contradiction: UI claimed approval, calldata transfers assets. |
| **`TRANSFER`** | `TRANSFER` | **NOT BLOCKED** | Aligned: Decoded transfer matches declared transfer. |
| **`SWAP`** | Recognized `SWAP` (`exactInputSingle`) | **NOT BLOCKED** | Aligned: Decoded swap matches declared swap. |
| **`CLAIM`** | `TRANSFER_FROM` | **NOT BLOCKED** | Deliberately outside contradiction matrix; NOT falsely claimed as verified. |
| **Custom / Unmodeled Language** | `UNKNOWN` | **NOT BLOCKED by RULE_04** | Outside deterministic vocabulary; passes RULE_04 without claiming verified intent. |

---

## 3. Defense-in-Depth Design

ActionProof implements defense-in-depth through orthogonal validation layers:
1. **Structural Validation:** Rejects any payload violating `actionproof.request.v1` schema.
2. **Cryptographic Validation:** Hashing ensures zero drift between evaluated payload and forwarded payload.
3. **Semantic Validation:** ABI decoding and multicall inspection ensure every execution step is fully understood.
4. **Behavioral Simulation:** Predicted state changes confirm real balance impacts before user authorization.

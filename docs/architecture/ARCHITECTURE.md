# ActionProof — Architecture & System Design

## 1. Core Problem & Product Definition

ActionProof is an Ethereum pre-signing transaction verification and enforcement layer for a **controlled EIP-1193 provider integration**.

Traditional DApps interact with Ethereum wallets by invoking `window.ethereum.request({ method: 'eth_sendTransaction', params: [tx] })`. In this ecosystem:
1. **DApp UI text is an untrusted claim:** A compromised frontend or malicious third-party script can display *"Swap 100 USDC -> ETH"* while crafting an adversarial payload such as `approve(attacker, MAX_UINT256)` or hiding malicious subcalls inside a `multicall` batch.
2. **Transaction requests are mutable in-flight:** Because JavaScript objects are passed by reference in the browser runtime, an attacker can modify transaction fields (`to`, `data`, `value`, `chainId`, `gas`) after verification logic has run but immediately before the wallet receives the request (TOCTOU mutation).
3. **Alternative write paths bypass verification:** Modern standards such as EIP-7702 (authorization lists) or EIP-5792 (`wallet_sendCalls`) introduce new execution semantics that cannot be silently treated as standard transactions.

ActionProof solves this by inserting an authoritative, controlled EIP-1193 Provider Proxy between the DApp and the Wallet.

---

## 2. The Three Security Levels

Understanding ActionProof's exact security boundary requires distinguishing three levels:

```text
┌─────────────────────────────────────────────────────────────┐
│ LEVEL 1: Semantic Transaction-Request Identity              │
│ Sender, destination, value, calldata, and chain context     │
├─────────────────────────────────────────────────────────────┤
│ LEVEL 2: Canonical Transaction-Request Binding              │
│ The immutable forwarded request is canonical-equivalent to   │
│ the request whose commitment was verified under the schema. │
├─────────────────────────────────────────────────────────────┤
│ LEVEL 3: Final Wallet Signing Payload Binding (NOT PROVEN)  │
│ The exact RLP-serialized bytes signed by wallet private key  │
└─────────────────────────────────────────────────────────────┘
```

> **The Precise Level-2 Guarantee:**
> *"Within an integration where ActionProof owns the EIP-1193 provider path to the wallet, the immutable forwarded transaction request is canonical-equivalent to the request whose commitment was verified under the actionproof.request.v1 schema."*
>
> **Mandatory Claim Boundary:**
> ActionProof establishes **Level-2 Canonical Transaction-Request Binding**.
> ActionProof does **NOT** establish Level 3. ActionProof does not claim to know or prove what an arbitrary wallet signs after the provider forwards the request.

---

## 3. End-to-End Control Flow Architecture

```text
  DApp UI (Untrusted)
        │
        │ EIP-1193: eth_sendTransaction(request)
        ▼
┌──────────────────────────────────────────────────────────────┐
│ ACTIONPROOF PROVIDER PROXY                                   │
│                                                              │
│  1. Capture & Deep Immutable Snapshot (freeze object)        │
│  2. Strict Schema Validation (Reject unknown/unsupported)    │
│  3. Deterministic Canonicalization (normalize fields)        │
│  4. Compute Keccak-256 Request Commitment:                   │
│     commitment_A = Keccak256("actionproof.request.v1" + ...) │
│                                                              │
│  5. Multi-Stage Evidence Gathering Pipeline:                 │
│     ├── Independent ABI calldata decoding                    │
│     ├── Recursive Multicall unpacking & stealth check        │
│     ├── Sourcify contract source correspondence check        │
│     ├── ERC-7730 v2 Clear-Signing descriptor analysis       │
│     └── EVM single-block state execution simulation          │
│                                                              │
│  6. Pure Deterministic Policy Evaluation:                    │
│     Emits: VERIFIED | WARNING | BLOCKED | UNSUPPORTED        │
│     (Zero LLM security authority; fail-closed enforcement)   │
│                                                              │
│  7. Synchronization Hook Point (Barrier for Test 7)          │
│                                                              │
│  8. Immutable Pre-Forward Snapshot:                          │
│     forwardPayload = createImmutableSnapshot(liveRequest)    │
│     (Neutralizes adversarial ES6 getter/proxy mutators)      │
│                                                              │
│  9. Pre-Forward Recheck (Synchronous, immediately prior):    │
│     commitment_B = Keccak256(canonicalize(forwardPayload))   │
│     Invariant Check: commitment_A == commitment_B?           │
│                                                              │
│       ┌──────────────┴──────────────┐                        │
│       ▼ MATCH                       ▼ MISMATCH / MUTATION    │
│    FORWARD TO WALLET             FAIL CLOSED / BLOCK         │
└───────┬─────────────────────────────┬────────────────────────┘
        │                             │
        ▼ (Immutable snapshot)        ▼ (No call dispatched)
   Wallet Provider                 Wallet Receives
   (e.g., MetaMask)                  NOTHING
```

---

## 4. Subsystem Components

### A. Provider Proxy (`src/provider/`)
- Implements the standard EIP-1193 `request({ method, params })` interface.
- Intercepts `eth_sendTransaction` and `wallet_sendCalls`.
- Passes through read queries (`eth_chainId`, `eth_accounts`, `eth_blockNumber`) while maintaining synchronized chain state.
- Controls the forwarding gate: on any violation or mismatch, the wallet provider method is **never invoked**.

### B. Canonical Request Model (`src/canonical/`)
- Strict schema validation rejecting unknown keys (`UNKNOWN_FIELD:<key>`).
- Fails closed on unsupported modern write fields (`maxFeePerBlobGas`, `authorizationList`, `UNSUPPORTED_CONTRACT_CREATION`).
- Normalizes addresses, Ethereum quantities (`0x0`, no leading zeroes), calldata bytes, access lists, and chain ID.
- Serializes using a fixed schema order with domain separator `actionproof.request.v1`.
- Hashes with Ethereum Keccak-256 via `viem`.

### C. Independent Decoder & Multicall (`src/analysis/`)
- Decodes standard ERC-20 transfers, approvals, and Uniswap v3 swaps without relying on client claims.
- Recursively unpacks supported multicall wrappers:
  - `multicall(bytes[])`
  - `multicall(uint256,bytes[])`
  - `aggregate((address,bytes)[])`
  - `aggregate3((address,bool,bytes)[])`
- Detects stealth unlimited approvals: strictly differentiates `EXACT_UNLIMITED` (`amount === uint256.max`) from `HIGH_VALUE_APPROVAL` (`amount >= threshold`) tucked behind legitimate actions.

### D. External Evidence Adapters
- **Contract Evidence (`src/analysis/contract.ts`):** Distinguishes `LOCAL_FIXTURE` from `LIVE_EXTERNAL` and `UNAVAILABLE`. Explicitly labeled: *Sourcify verified source/bytecode correspondence evidence. Does NOT establish contract safety.*
- **Clear-Signing Adapter (`src/intent/erc7730.ts`):** Adapts ERC-7730 v2 descriptors (labeled `LOCAL_FIXTURE` or `LIVE_REGISTRY`). Deterministically cross-validates descriptor fields against independent ABI decoding. Advisory evidence only.
- **Simulation Adapter (`src/analysis/simulation.ts`):** Honest simulation architecture: defaults to `UnavailableSimulationAdapter` (`provenance: 'UNAVAILABLE'`) which emits policy `WARNING` (degraded evidence). Explicitly labeled `LocalFixtureSimulationAdapter` (`provenance: 'LOCAL_FIXTURE'`) or `LiveRPCSimulationAdapter` (`provenance: 'LIVE_BACKEND'`). Never fabricates synthetic simulation results from calldata. Explicitly documents TOCTOU limitations.

### E. Deterministic Policy Engine (`src/policy/`)
- Evaluates evidence using strict, pure, deterministic rules.
- Zero reliance on LLMs or non-deterministic heuristics for security verdicts.
- Allowed verdicts: `VERIFIED`, `WARNING`, `BLOCKED`, `UNSUPPORTED`.

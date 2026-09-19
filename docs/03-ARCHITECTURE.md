# ActionProof — Subsystem Architecture & Component Hierarchy

## 1. High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Client Application Layer
        DApp["DApp Frontend / Script / Test Runner"]
    end

    subgraph ActionProof Security Core
        Proxy["ActionProofProviderProxy<br/>(EIP-1193 Wrapper)"]
        Snapshot["Deep Freeze & Snapshot Engine<br/>(anti-accessor & mutation-proof)"]
        Canonicalizer["Canonical Request Normalizer<br/>(actionproof.request.v1)"]
        Commitment["SHA-256 Canonical Commitment Engine"]
        
        subgraph Independent Analysis & Evidence
            ABIDecoder["Independent ABI Decoder"]
            Multicall["Recursive Multicall Inspector"]
            Sourcify["Sourcify Registry Adapter"]
            ERC7730["ERC-7730 Intent Format Adapter"]
            Simulation["Simulation Adapter<br/>(Explicit Provenance)"]
        end

        subgraph Deterministic Decision Engine
            Policy["Deterministic Policy Engine<br/>(Fail-Closed Logic)"]
            Verdict{"Security Verdict<br/>(VERIFIED / BLOCKED / WARNING)"}
        end

        Barrier["Pre-Forward Commitment Barrier<br/>(Re-hashes & Validates Snapshot)"]
    end

    subgraph Wallet Layer
        Wallet["Underlying EIP-1193 Wallet<br/>(MetaMask / Rabby / MockWallet)"]
    end

    DApp -->|"eth_sendTransaction(payload)"| Proxy
    Proxy --> Snapshot
    Snapshot --> Canonicalizer
    Canonicalizer --> Commitment
    Commitment --> ABIDecoder & Multicall & Sourcify & ERC7730 & Simulation
    ABIDecoder & Multicall & Sourcify & ERC7730 & Simulation --> Policy
    Policy --> Verdict

    Verdict -->|"VERIFIED"| Barrier
    Verdict -->|"BLOCKED / UNSUPPORTED"| Proxy
    Barrier -->|"Re-check MATCH"| Wallet
    Barrier -.->|"COMMITMENT_MISMATCH"| Proxy
```

---

## 2. In-Process Client-Side Execution Model

ActionProof is designed as an **in-process, zero-network-dependency security library and proxy**. 

* **No Backend Server Required:** ActionProof does not rely on a centralized API, cloud scanner, or off-chain oracle to perform transaction interception and policy enforcement.
* **Direct Provider Wrapping:** Any standard EIP-1193 provider (e.g. `window.ethereum`) is wrapped via:
  ```typescript
  const secureProvider = createActionProofProxy(underlyingProvider, options);
  ```
* **Thread-Isolated Execution:** The snapshotting, normalization, decoding, and policy evaluation occur synchronously within the client runtime before the asynchronous forwarding promise is invoked.

---

## 3. Subsystem Breakdown

### 3.1. Canonical Normalization & Commitment (`src/canonical/`)
* **`types.ts`**: Defines the strict schema specification `actionproof.request.v1`. Contains exact field types for `to`, `from`, `data`, `value`, `chainId`, `gas`, `maxFeePerGas`, `maxPriorityFeePerGas`, and `accessList`.
* **`snapshot.ts`**: Implements deep freezing and recursive copying. Resolves all getters, disarms Proxy traps, and produces a tamper-proof clone of the in-flight transaction.
* **`canonicalize.ts`**: Performs strict normalization: converts addresses to lowercase, strips leading zeros from hex numbers, normalizes calldata (`0x` if empty), and sorts access list entries.
* **`commitment.ts`**: Deterministically serializes the canonical object using sorted JSON keys and computes its SHA-256 hash.

### 3.2. Provider Interception & Barrier (`src/provider/`)
* **`proxy.ts`**: Implements the EIP-1193 interface (`request()`). Intercepts `eth_sendTransaction`, runs the ActionProof pipeline, and enforces pre-forward commitment rechecks. Non-transaction RPC calls (`eth_chainId`, `eth_accounts`, etc.) are passed through transparently.
* **`interceptor.ts`**: Orchestrates the analysis pipeline and converts raw transaction payloads into fully evaluated `ActionProofResult` structures.
* **`preForwardBarrier.ts`**: Performs the critical pre-dispatch security assertion: re-canonicalizes the payload immediately before handing it to `underlyingProvider.request()`, verifying that the commitment matches the evaluated snapshot.

### 3.3. Transaction Decoding & Analysis (`src/analysis/`)
* **`abiDecoder.ts`**: Independently parses calldata against built-in interfaces (ERC-20, Uniswap V2/V3, Permitted Tokens) without relying on DApp-provided ABIs. Identifies function selectors, argument names, and types.
* **`multicall.ts`**: Recursively unpacks batched transactions (`multicall`, `aggregate`, `aggregate3`). Traverses nested byte arrays to find hidden calls (such as stealth `approve` operations masked behind swap routers).

### 3.4. Evidence Aggregation (`src/evidence/`)
* **`sourcifyAdapter.ts`**: Simulates contract verification queries against Sourcify/Etherscan, verifying whether the target contract's source code and metadata are authenticated.
* **`erc7730Adapter.ts`**: Parses ERC-7730 Clear Signing metadata to match function signatures to human-readable intent schemas.
* **`simulationAdapter.ts`**: Provides execution simulation evidence. Clearly tracks provenance (`LOCAL_FIXTURE` vs `LIVE_RPC`) to ensure honesty, returning predicted balance deltas and state changes.

### 3.5. Policy & Decision Engine (`src/policy/`)
* **`engine.ts`**: Evaluates verified evidence against a deterministic ruleset. Computes risk scores and assigns verdicts: `VERIFIED`, `WARNING`, `BLOCKED`, or `UNSUPPORTED`.
* **`rules/`**: Dedicated deterministic rule modules:
  * `stealthApprovalRule.ts`: Blocks unexpected approvals inside multicalls.
  * `calldataIntegrityRule.ts`: Fails closed on unknown or malformed calldata.
  * `unsupportedTypeRule.ts`: Rejects unsupported EIP-7702 or blob transactions.
  * `commitmentIntegrityRule.ts`: Verifies post-check immutability.

### 3.6. User Interface & Observability (`src/ui/`)
* **`App.tsx`**: React dashboard displaying the live transaction verification pipeline, evidence traces, and mock wallet balance state.
* **`runner.ts` (`DemoRunner`)**: Manages the deterministic execution lifecycle (`READY` $\rightarrow$ `RUNNING` $\rightarrow$ `COMPLETED`), maintaining an explicit execution counter and real runtime timestamp.

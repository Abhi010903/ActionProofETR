# ActionProof

> **Verify the transaction, not just the screen.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-241%20passing-brightgreen.svg)]()
[![Security Level](https://img.shields.io/badge/Security-Level--2%20Provider%20Binding-purple.svg)]()
[![Ecosystem](https://img.shields.io/badge/Ecosystem-Ethereum%20EIP--1193-orange.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Cloudflare%20Pages-success.svg)](https://actionproof-etr.pages.dev)

**ActionProof** is a deterministic, pre-signing transaction security enforcement gate built at the **EIP-1193** provider boundary. It protects users from deceptive decentralized application frontends, malicious calldata, stealth approvals, and in-memory parameter tampering before any authorization request reaches the wallet.

* **Live Application:** [https://actionproof-etr.pages.dev](https://actionproof-etr.pages.dev)
* **GitHub Repository:** [https://github.com/Abhi010903/ActionProofETR](https://github.com/Abhi010903/ActionProofETR)
* **Hackathon Submission:** Crypto World's Fair 2026
* **Security Level:** Level-2 Canonical Provider-Request Binding
* **Rule Engine:** 100% Deterministic — Zero Probabilistic LLM Authority
* **Current Release:** [`734fd79`](https://github.com/Abhi010903/ActionProofETR/commit/734fd79b8b3f07e36bf0931557b9f1539bfbe296)

---

## Table of Contents

1. [The Problem: The Pre-Signing Authorization Gap](#1-the-problem-the-pre-signing-authorization-gap)
2. [The Solution: In-Line Machine-Verified Enforcement](#2-the-solution-in-line-machine-verified-enforcement)
3. [Key Features & Differentiation](#3-key-features--differentiation)
4. [Architecture & System Flow](#4-architecture--system-flow)
5. [The Three Live Evidence Integrations](#5-the-three-live-evidence-integrations)
6. [Execution Modes: DEMO FIXTURES vs. LIVE RECONNAISSANCE](#6-execution-modes-demo-fixtures-vs-live-reconnaissance)
7. [Evidence Provenance & Verdict Engine](#7-evidence-provenance--verdict-engine)
8. [Level-2 Provider-Request Binding & Security Boundary](#8-level-2-provider-request-binding--security-boundary)
9. [How It Works: Legitimate Swap vs. Malicious Multicall](#9-how-it-works-legitimate-swap-vs-malicious-multicall)
10. [The 5 Evaluator Demo Scenarios](#10-the-5-evaluator-demo-scenarios)
11. [Interactive Security Console & Observability](#11-interactive-security-console--observability)
12. [Technology Stack](#12-technology-stack)
13. [Quickstart: Setup, Run, and Test](#13-quickstart-setup-run-and-test)
14. [Automated Test Suite (241 Tests Across 8 Suites)](#14-automated-test-suite-241-tests-across-8-suites)
15. [Limitations, Threat Model & Explicit Non-Claims](#15-limitations-threat-model--explicit-non-claims)
16. [Codebase Map & Subsystem Structure](#16-codebase-map--subsystem-structure)
17. [Project Status & Future Roadmap](#17-project-status--future-roadmap)
18. [Comprehensive Documentation Index](#18-comprehensive-documentation-index)

---

## 1. The Problem: The Pre-Signing Authorization Gap

In contemporary Web3 applications, irreversible cryptographic authorization decisions are routinely made based on unverified screen claims:

* **Deceptive Frontend UIs:** A DApp interface claims *"Swap 100 USDC for ETH"* while crafting calldata that transfers tokens to an attacker address.
* **Stealth Multicall Injections:** Legitimate interactions are bundled alongside unauthorized approvals (`token.approve(attacker, type(uint256).max)`) inside batch contracts (`Multicall3`, `SwapRouter02`).
* **In-Memory Post-Verification Mutation (TOCTOU):** Malicious browser scripts or extensions alter transaction parameters in JavaScript memory *after* security scanners examine them, but *before* the wallet receives the payload.
* **Calldata Opacity & Confirmation Fatigue:** Users are presented with raw hexadecimal strings, leading to habitual "Confirm" clicking.
* **Alternative Write Path Exploits:** Emerging transaction types (e.g. EIP-7702 delegation, blob transactions, account abstraction user operations) bypass naive pattern-matching scanners.

Existing wallet extensions act as passive visualizers or rely on non-deterministic LLMs. Neither architecture guarantees that the byte payload presented to the user corresponds cryptographically to what was analyzed.

---

## 2. The Solution: In-Line Machine-Verified Enforcement

**ActionProof** sits directly between the application and the user's Web3 wallet by wrapping the standard EIP-1193 provider (`window.ethereum`).

Instead of providing advisory warnings, ActionProof operates as an **active, fail-closed enforcement gate**:

1. **Anti-Accessor Freezing:** Intercepts `eth_sendTransaction`, reads properties in a single pass to neutralize malicious getter exploits, and recursively freezes an immutable snapshot.
2. **Canonical Commitment:** Normalizes transaction fields into a strict deterministic schema (`actionproof.request.v1`) and computes a cryptographic Keccak-256 commitment hash ($\mathcal{C}_{\text{verified}}$).
3. **Independent Evidence Pipeline:** Independently decodes calldata (including recursive multicall inspection), queries contract identity from Sourcify v2, checks clear-signing specifications via ERC-7730, and executes read-only `eth_call` simulation.
4. **Pure Deterministic Policy:** Evaluates machine-checked security rules—**zero LLM involvement**—consuming gathered evidence as factual input to produce a verdict: `VERIFIED`, `DEMO_VERIFIED`, `WARNING`, `BLOCKED`, or `UNSUPPORTED`.
5. **Pre-Forward Commitment Barrier:** Immediately prior to dispatching to the wallet, ActionProof re-hashes the outgoing payload. If any field was mutated in memory ($\mathcal{C}_{\text{fwd}} \neq \mathcal{C}_{\text{verified}}$), **ActionProof halts execution and the wallet is never invoked.**

---

## 3. Key Features & Differentiation

| Capability | Standard Wallet / Security Extension | ActionProof Enforcement Gate |
|---|---|---|
| **Interception Point** | Passive visualizer / read-only advisor | In-line EIP-1193 wrapper gate |
| **Tamper Protection** | Vulnerable to in-memory JS mutation | Single-pass anti-accessor freeze + pre-forward commitment recheck |
| **Multicall Inspection** | Surface-level function decoding | Recursive multicall traversal & stealth approval detection |
| **Decision Authority** | Advisory warnings or probabilistic LLM | Pure mathematical deterministic policy rules |
| **Forwarding Guarantee** | Forwards whatever mutable memory holds | Derives forwarded RPC payload from verified canonical commitment |
| **Alternative Types** | May silently ignore unrecognized fields | Fails closed on EIP-7702, ERC-4337, and blobs (`UNSUPPORTED`) |
| **Evidence Provenance** | Obscures mock vs. live execution | Strictly separates `LIVE_*` external evidence from `LOCAL_FIXTURE` |
| **Live External Reconnaissance** | Often closed-source or proprietary APIs | Open, keyless integrations: Sourcify v2, ERC-7730, public EVM RPC |

---

## 4. Architecture & System Flow

```mermaid
flowchart TD
    subgraph DApp["Client Application Layer"]
        App["DApp Frontend / Web3 Script"]
    end

    subgraph Core["ActionProof Security Core"]
        Proxy["ActionProofProviderProxy (EIP-1193 Wrapper)"]
        Snap["Single-Pass Anti-Accessor Freeze"]
        Canon["Canonicalizer (actionproof.request.v1)"]
        Commit["Keccak-256 Commitment (C_verified)"]

        subgraph Analysis["Independent Evidence Pipeline"]
            Dec["ABI Calldata Decoder"]
            Multi["Recursive Multicall Inspector"]
            Sourcify["Sourcify Verification Adapter (v2 API)"]
            ERC7730["ERC-7730 Clear-Signing Adapter (GitHub Registry)"]
            Sim["Read-Only Simulation Adapter (eth_call RPC)"]
        end

        subgraph Decision["Policy Engine"]
            Policy["Deterministic Policy Engine"]
            Verdict{"Security Verdict"}
        end

        subgraph Barrier["Pre-Forward Commitment Barrier"]
            Recheck["Pre-Forward Commitment Re-check (C_fwd == C_verified)"]
            Derive["Canonical RPC Serialization"]
        end
    end

    subgraph Wallet["Wallet Layer"]
        Provider["Underlying EIP-1193 Provider (MetaMask / Rabby / Mock)"]
    end

    App -->|"eth_sendTransaction(payload)"| Proxy
    Proxy --> Snap
    Snap --> Canon
    Canon --> Commit
    Commit --> Dec & Multi & Sourcify & ERC7730 & Sim
    Dec & Multi & Sourcify & ERC7730 & Sim --> Policy
    Policy --> Verdict

    Verdict -->|"VERIFIED / DEMO_VERIFIED"| Recheck
    Verdict -->|"BLOCKED / UNSUPPORTED / REVERTED"| HaltProxy["Halt Execution (Wallet Never Called)"]

    Recheck -->|"Commitment Match (C_fwd == C_verified)"| Derive
    Recheck -.->|"Mismatch (TOCTOU Tamper)"| Abort["Halt: COMMITMENT_MISMATCH"]
    Derive -->|"Forward Verified RPC Payload"| Provider
```

---

## 5. The Three Live Evidence Integrations

ActionProof integrates three free, public, keyless external evidence sources without requiring proprietary APIs or custodial middleware:

### 1. Sourcify Contract Metadata & ABI Evidence
* **Public Endpoint:** `https://sourcify.dev/server` (Sourcify v2 API)
* **Functionality:** Queries verified source/bytecode correspondence using chain ID and target contract address.
* **Integrity Validation:** Validates that response records match the requested address and chain identity. Distinguishes:
  * `FULL_MATCH`: Exact match between on-chain bytecode and verified source code metadata.
  * `PARTIAL_MATCH`: Source code matches bytecode with differences in compiler metadata/hash.
  * `UNVERIFIED`: Genuine negative match confirmed by Sourcify (contract target is present on-chain but unverified).
  * `UNAVAILABLE`: Network failure, timeout, or malformed API response (fails closed to degraded state with provenance `NONE`).
* **Security Notice:** Sourcify verification attests to source/bytecode correspondence; it does **not** prove that the contract's business logic is benign, audit-free, or secure.

### 2. ERC-7730 Clear-Signing Registry Evidence
* **Public Endpoint:** `https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master`
* **Functionality:** Fetches standardized ERC-7730 descriptor definitions published in the official Ethereum community registry.
* **Integrity Validation:** Validates descriptor deployment addresses against the requested contract and chain ID. Cross-validates decoded transaction arguments against schema fields. Distinguishes:
  * `DESCRIPTOR_FOUND`: Valid descriptor located and calldata fields successfully cross-validated.
  * `DESCRIPTOR_ABSENT`: Genuine negative match in registry (404 response or no descriptor registered for contract/selector).
  * `DESCRIPTOR_MISMATCH`: Descriptor found but calldata arguments deviate from expected schema (triggers fatal policy violation and issues `BLOCKED`).
  * `UNAVAILABLE`: Network failure, timeout, or malformed JSON (fails closed to degraded state with provenance `NONE`).

### 3. Read-Only Ethereum RPC Simulation (`eth_call`)
* **Public Endpoint:** `https://rpc.mevblocker.io` (or any standard EIP-1193 JSON-RPC provider)
* **Functionality:** Executes a read-only dry run using `eth_call` at the current chain block context.
* **Integrity Validation:** Synchronizes and validates chain identity (`eth_chainId`). Accurately detects and parses EVM reverts:
  * Standard string reverts (`0x08c379a0` / `Error(string)`).
  * Panic codes (`0x4e487b71` / `Panic(uint256)`).
  * RPC error objects with code 3 or execution revert messages.
* **Zero Fabricated State Diffs or Token Balances:** The live simulation adapter executes read-only `eth_call` to determine execution success or extract revert data under the specified block context. It does **not** trace arbitrary internal storage or token balance deltas; the live adapter never fabricates balance diffs, gas estimates, or synthetic state mutations.
* **Security Notice:** `eth_call` simulates execution against current block state; it does **not** prove that a transaction will succeed when mined (due to mempool reordering, state drift, slippage, or front-running).

### Negative Facts vs. Infrastructure Failures
ActionProof strictly distinguishes between genuine negative attestations and transport/service failures:
* **`UNVERIFIED` (Contract Bytecode):** A confirmed negative match from Sourcify indicating the contract target exists on-chain but has no verified source code corresponding to its deployed bytecode.
* **`DESCRIPTOR_ABSENT` (ERC-7730 Format):** The ERC-7730 registry was successfully reached, but no clear-signing descriptor has been authored or published for this contract deployment and function selector.
* **`UNAVAILABLE` (External Services):** A transport failure, network timeout, HTTP error (5xx / 429), or malformed response encountered while querying external infrastructure (Sourcify, GitHub, or RPC). Fails closed with provenance `NONE`, ensuring offline or degraded services are never misrepresented as verified negative facts.

---

## 6. Execution Modes: DEMO FIXTURES vs. LIVE RECONNAISSANCE

The ActionProof console features two strictly separated execution modes:

```
+-----------------------------------------------------------------------------------------+
|                                    ACTIONPROOF MODES                                    |
+---------------------------------------------+-------------------------------------------+
|             DEMO FIXTURES MODE              |         LIVE RECONNAISSANCE MODE          |
+---------------------------------------------+-------------------------------------------+
| * Uses local in-memory deterministic data.  | * Queries genuine external endpoints.     |
| * Reproduces edge-case attack scenarios.    | * Zero mocks: Sourcify, ERC-7730, RPC.   |
| * Provenance tagged as LOCAL_FIXTURE.       | * Provenance tagged as LIVE_*.            |
| * Eligible only for DEMO_VERIFIED.          | * Required for production VERIFIED.       |
| * Never hits live network or external APIs. | * Degrades to WARNING/BLOCKED on failure. |
+---------------------------------------------+-------------------------------------------+
```

### Strict Non-Contamination Boundary
ActionProof enforces a strict provenance boundary:
* **Production `VERIFIED` cannot be achieved using `LOCAL_FIXTURE` data.**
* When switched to **LIVE RECONNAISSANCE**, the console instantiates `createPublicLiveEvidencePipeline()`. Any network failure, unverified contract, or missing descriptor degrades to `WARNING` or `BLOCKED`.
* The UI clearly distinguishes modes with dedicated badges, preventing mock data from being presented as live proof.

### Production Pipeline Entry Points (Source Code Verified)
ActionProof exports two distinct production pipeline factories in [`src/evidence/pipeline.ts`](src/evidence/pipeline.ts):
* **`createPublicLiveEvidencePipeline(options)`**: The convenience factory utilized by the live demo console, preconfigured with default free, keyless endpoints:
  * Sourcify v2 API (`https://sourcify.dev/server`)
  * Ethereum RPC (`https://rpc.mevblocker.io`, 5000ms timeout)
  * ERC-7730 Registry (`https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master`)
* **`createLiveEvidencePipeline(options)`**: The strict core production factory. Enforces production trust boundaries and **strictly rejects** any injected custom test adapters, mocks, or simulated transports (`fetchFn`, `contractAdapter`, `simulationAdapter`, etc.), failing closed with an explicit error if mock injection is detected.

---

## 7. Evidence Provenance & Verdict Engine

ActionProof strictly enforces honesty across all evidence domains, keeping provenance origins and domain statuses completely distinct:

### Provenance Origins
| Provenance Label | Meaning | Production Policy Impact | Demo Policy Impact |
|---|---|---|---|
| `LIVE_EXTERNAL` | Genuine external response from Sourcify v2 API (source/bytecode correspondence). | Eligible for `VERIFIED` | Eligible for `VERIFIED` |
| `LIVE_REGISTRY` | Genuine external response from official GitHub ERC-7730 registry. | Eligible for `VERIFIED` | Eligible for `VERIFIED` |
| `LIVE_BACKEND` | Genuine JSON-RPC `eth_call` response on an aligned block context. | Eligible for `VERIFIED` | Eligible for `VERIFIED` |
| `LOCAL_FIXTURE` | Deterministic in-memory test or demonstration fixture. | **Degrades to `WARNING`** (Cannot achieve `VERIFIED`) | Yields **`DEMO_VERIFIED`** |
| `NONE` | No response obtained due to transport failure, timeout, or missing endpoint. | Degrades to **`WARNING`** (Fails closed) | Degrades to **`WARNING`** |

### Domain Evidence Statuses: Distinguishing Negative Matches from Service Outages
| Evidence Status | Domain | Provenance | Technical Meaning | Policy Impact |
|---|---|---|---|---|
| `VERIFIED_CORRESPONDENCE` | Contract | `LIVE_EXTERNAL` | Sourcify confirms bytecode correspondence against source code metadata. | Required for production `VERIFIED` |
| `UNVERIFIED` | Contract | `LIVE_EXTERNAL` | Sourcify confirms contract is deployed on-chain but source code is unverified (negative match). | Degrades to `WARNING` |
| `DESCRIPTOR_FOUND` | Clear-Signing | `LIVE_REGISTRY` | Official ERC-7730 descriptor located and calldata cross-validation matches. | Required for production `VERIFIED` |
| `DESCRIPTOR_ABSENT` | Clear-Signing | `LIVE_REGISTRY` | Registry reached, but no descriptor is published for target contract/selector (negative match). | Degrades to `WARNING` |
| `DESCRIPTOR_MISMATCH` | Clear-Signing | `LIVE_REGISTRY` | Descriptor located, but calldata arguments contradict expected format schema. | Issues **`BLOCKED`** |
| `LIVE_SIMULATED` | Simulation | `LIVE_BACKEND` | Read-only `eth_call` executed without revert at specified block context. | Required for production `VERIFIED` |
| `REVERTED` | Simulation | `LIVE_BACKEND` | Read-only `eth_call` reverted; honest revert reason/panic code parsed. | Issues **`BLOCKED`** |
| `FIXTURE_SIMULATION` | Simulation | `LOCAL_FIXTURE` | Offline deterministic scenario simulation fixture. | Yields `DEMO_VERIFIED` |
| `UNAVAILABLE` | Any Domain | `NONE` | Network error, timeout, HTTP 5xx, or unconfigured service. Fails closed. | Degrades to `WARNING` |

### Policy Verdicts
* **`VERIFIED`**: Production mode only. Explicitly defined as **passing ActionProof's deterministic policy engine** with all required live external evidence verified (Sourcify source/bytecode correspondence, ERC-7730 clear-signing descriptor match, and non-reverting read-only `eth_call` simulation). **`VERIFIED` is strictly a deterministic policy-pass verdict, NOT a guarantee or warranty of contract runtime safety, economic soundness, or future broadcast success.**
* **`DEMO_VERIFIED`**: Demo mode only. Transaction satisfied deterministic policy rules using local offline fixtures (`LOCAL_FIXTURE`).
* **`WARNING`**: Transaction has unverified bytecode (`UNVERIFIED`), missing descriptors (`DESCRIPTOR_ABSENT`), degraded services (`UNAVAILABLE`), or elevated approval risks requiring user caution. Cannot achieve `VERIFIED`.
* **`BLOCKED`**: Hard policy violation (e.g., unlimited approval, intent contradiction, stealth multicall injection, unknown calldata, descriptor cross-validation mismatch, or simulation revert). Halts execution; wallet is never called.
* **`UNSUPPORTED`**: Transaction type is outside supported MVP scope (e.g., EIP-7702, ERC-4337, EIP-4844 blobs). Fails closed immediately.

> [!IMPORTANT]
> **`VERIFIED` is a Policy Verdict, NOT a Proof of Safety:**
> A `VERIFIED` verdict confirms that the transaction passed ActionProof's deterministic rules (e.g., recipient integrity, approval thresholds, calldata unrolling, and matching live reconnaissance). It does **not** certify that the underlying smart contract is bug-free, economically sound, immune to oracle/flash-loan exploits, or guaranteed to execute successfully when broadcast to the public mempool.

---

## 8. Level-2 Provider-Request Binding & Security Boundary

ActionProof defines transaction authorization security across three architectural tiers:

```
+-------------------------------------------------------------------------------+
| Level 1: Semantic Request Identity                                            |
| Parses to, data, value, chainId. Advisory only; vulnerable to in-memory TOCTOU.|
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| Level 2: Canonical Provider Request Binding  [ ACTIONPROOF MVP GUARANTEE ]    |
| Invariant: Forwarded request is canonical-equivalent to verified request.     |
| Enforced by synchronous pre-forward cryptographic commitment barrier.        |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| Level 3: Final Wallet Signing Payload Binding  [ OUTSIDE MVP SCOPE ]          |
| Invariant: Raw RLP bytes signed by secure enclave match verified request.    |
| Requires wallet-internal firmware integration; honestly marked OUTSIDE MVP.  |
+-------------------------------------------------------------------------------+
```

### The Level-2 Guarantee
> *"Within an integration where ActionProof owns the EIP-1193 provider path to the wallet, the immutable forwarded transaction request is canonical-equivalent to the request whose commitment was verified under the `actionproof.request.v1` schema."*

Mathematically enforced at the barrier:
$$\forall T \in \text{Transactions}, \quad \text{Dispatch}(T_{\text{fwd}}) \iff \mathcal{H}(\mathcal{N}(T_{\text{fwd}})) \equiv \mathcal{C}_{\text{verified}}$$

If $\mathcal{H}(\mathcal{N}(T_{\text{fwd}})) \neq \mathcal{C}_{\text{verified}}$, the pre-forward barrier aborts with `COMMITMENT_MISMATCH` and the wallet provider receives **0** calls.

---

## 9. How It Works: Legitimate Swap vs. Malicious Multicall

### Scenario A: Legitimate Uniswap V3 Swap
1. **Frontend Request:** DApp requests `eth_sendTransaction` calling Uniswap V3 `exactInputSingle` for 100 USDC $\rightarrow$ WETH.
2. **Snapshot & Commitment:** ActionProof captures `from`, `to`, `data`, `value`, `chainId`. Computes Keccak-256 commitment hash ($\mathcal{C}_{\text{verified}}$).
3. **Evidence Collection:**
   * Decoder identifies `exactInputSingle(params)` with recipient matching the sender.
   * Sourcify adapter verifies router contract bytecode match.
   * ERC-7730 adapter validates clear-signing format against schema.
   * Simulation confirms successful read-only `eth_call`.
4. **Policy Decision:** All rules pass cleanly. Verdict: `VERIFIED` (in live reconnaissance mode) or `DEMO_VERIFIED` (in demo mode).
5. **Pre-Forward Barrier:** Validates outgoing commitment matches $\mathcal{C}_{\text{verified}}$, serializes canonical RPC payload, and forwards to wallet.

### Scenario B: Deceptive Multicall Attack (Hidden Unlimited Approval)
1. **Frontend Claim:** DApp UI states: *"Swap 100 USDC for ETH"*.
2. **Raw Calldata:** The frontend generates a `multicall` transaction containing two subcalls:
   * Subcall 1: Legitimate swap for 100 USDC.
   * Subcall 2: `approve(attackerAddress, 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)`.
3. **Multicall Unrolling:** The recursive multicall inspector unpacks the subcall batch and identifies the hidden unlimited allowance.
4. **Policy Violation:**
   * `RULE_02A` triggers: Exact unlimited token approval ($2^{256} - 1$) detected.
   * `RULE_03` triggers: Dangerous subcall detected within multicall batch.
   * `RULE_04` triggers: Calldata contradicts declared application intent.
   * `RULE_09` triggers: Approval spender is an unbound third-party address.
5. **Enforcement:** ActionProof issues verdict **`BLOCKED`**. The transaction promise rejects immediately. **The wallet confirmation screen is never triggered.**

---

## 10. The 5 Evaluator Demo Scenarios

| # | Scenario | DApp UI Claim | Calldata Semantics | Policy Verdict | Barrier Status | Forwarded to Wallet? |
|---|---|---|---|---|---|---|
| **1** | **Normal Supported Swap** | *"Swap 100 USDC for ETH on Uniswap V3"* | Valid `exactInputSingle` parameters | **`DEMO_VERIFIED`** *(or `VERIFIED` in live)* | Matches ($\mathcal{C}_{\text{fwd}} = \mathcal{C}_{\text{verified}}$) | **YES (1 call)** |
| **2** | **Hidden Unlimited Approval** | *"Swap 100 USDC for ETH"* | `multicall` with hidden `approve(attacker, MAX_UINT)` | **`BLOCKED`** | Blocked at policy stage | **NO (0 calls)** |
| **3** | **Post-Verification Mutation** | *"Swap 100 USDC for ETH"* | Valid calldata, but `to` mutated in memory post-scan | **`COMMITMENT_MISMATCH`** | **Barrier Tripped!** ($\mathcal{C}_{\text{fwd}} \neq \mathcal{C}_{\text{verified}}$) | **NO (0 calls)** |
| **4** | **Unknown Calldata** | *"Claim Staking Rewards"* | Unrecognized selector `0x12345678...` | **`BLOCKED`** (`UNKNOWN_CALLDATA`) | Blocked at policy stage | **NO (0 calls)** |
| **5** | **Unsupported Type (EIP-7702)** | *"Delegate Account Execution"* | Type-4 transaction with `authorizationList` | **`UNSUPPORTED`** | Blocked at schema validation | **NO (0 calls)** |

---

## 11. Interactive Security Console & Observability

ActionProof includes an evaluator dashboard built with React and Vite:

* **Staged Unexecuted State (`READY`):** Selecting a scenario prepares the payload without auto-executing. The Staged Request Preview renders with state `READY`.
* **Explicit Execution Gate:** Clicking **`🛡️ Intercept & Verify Request`** dispatches the request through the live `ActionProofProviderProxy`.
* **Live vs. Demo Toggle:** Instantly switch between `DEMO FIXTURES` and `LIVE RECONNAISSANCE` without mixing evidence.
* **Live Telemetry:** Displays browser timestamps and a monotonic execution counter (`Execution #1`, `Execution #2`).
* **Visual Commitment Barrier:** In Scenario 3, a dedicated barrier alert displays the verified commitment hash side-by-side with the tampered post-verification hash.
* **Deterministic Reset:** Clicking **`🔄 Reset Demo State`** clears mock wallet logs and resets the console.

---

## 12. Technology Stack

* **Language:** TypeScript 5.7 (Strict mode, zero `any` bypasses in security core)
* **Build System:** Vite 5.4
* **Testing Framework:** Vitest 2.1 (Hermetic, deterministic test execution)
* **Cryptography & Encoding:** `viem` 2.56 (Keccak-256, ABI decoding, hex utilities)
* **User Interface:** React 19, Lucide React
* **External APIs (Free & Keyless):**
  * Sourcify v2 (`https://sourcify.dev/server`)
  * Ethereum Clear-Signing ERC-7730 Registry (`https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master`)
  * MEV Blocker Public RPC (`https://rpc.mevblocker.io`)

---

## 13. Quickstart: Setup, Run, and Test

### Prerequisites
* **Node.js:** v18.0.0 or higher
* **npm:** v9.0.0 or higher

### 1. Clone & Install
```bash
git clone https://github.com/Abhi010903/ActionProofETR.git
cd ActionProofETR
npm install
```

### 2. Verify Repository Health (Verification Triad)
```bash
# Type check: 0 errors
npm run typecheck

# Automated test suite: 241 tests passing across 8 files
npm test

# Production build: clean compilation
npm run build
```

### 3. Launch the Interactive Demo Console
```bash
npm run dev
```
Open **`http://localhost:5173`** in your browser to explore the 5 evaluator scenarios and toggle between Demo and Live Reconnaissance.

### 4. Run Read-Only Live Smoke Tests
```bash
# Execute standalone live smoke tests against Sourcify, ERC-7730, and RPC:
npx tsx scripts/live-smoke-test.ts

# Execute a live read-only swap transaction analysis:
npx tsx scripts/test-swap-live.ts
```

---

## 14. Automated Test Suite (241 Tests Across 8 Suites)

The test suite covers **241** deterministic test cases across **8** test files:

```text
 ✓ tests/canonical/canonical.test.ts                     (22 tests)
 ✓ tests/policy/policy.test.ts                           (65 tests)
 ✓ tests/analysis/multicall.test.ts                       (9 tests)
 ✓ tests/integration/live-evidence-integrations.test.ts   (21 tests)
 ✓ tests/integration/end-to-end.test.ts                   (7 tests)
 ✓ tests/ui/demo-observability.test.ts                    (8 tests)
 ✓ tests/provider/provider-binding.test.ts              (104 tests)
 ✓ tests/analysis/evidence-honesty.test.ts                (5 tests)

 Test Files  8 passed (8)
      Tests  241 passed (241)
```

### Coverage Highlights:
* **Provider Binding (`provider-binding.test.ts` — 104 tests):** Tests 1–12 formal specifications, single-pass getter disarming, in-flight mutation detection, circular reference rejection, `accessList` isolation, chain ID sync, canonical RPC forwarding, fail-closed transport isolation, and adversarial provenance verification.
* **Policy Engine (`policy.test.ts` — 65 tests):** Deterministic policy evaluation, `RULE_04` intent contradiction matrix, fail-closed unknown calldata, decimal-aware approval thresholds, recipient integrity, and provenance degradation.
* **Live Evidence Integrations (`live-evidence-integrations.test.ts` — 21 tests):** Sourcify chain ID validation, negative match handling, ERC-7730 format matching, cross-validation discrepancy detection, `eth_call` revert handling, and live pipeline factory enforcement.
* **Canonical Normalization (`canonical.test.ts` — 22 tests):** Schema whitelisting, address lowercasing, quantity trimming, access list sorting, and serialization determinism under `actionproof.request.v1`.
* **Multicall Analysis (`multicall.test.ts` — 9 tests):** Recursive multicall unrolling (up to 3 levels deep), stealth approval isolation, and threshold boundaries.
* **Integration E2E (`end-to-end.test.ts` — 7 tests):** Full pipeline flows for normal swaps, attacks, mutations, unknown calldata, EIP-7702 delegation, and live pipelines.
* **Evidence Honesty (`evidence-honesty.test.ts` — 5 tests):** Simulation provenance (`LOCAL_FIXTURE` vs `LIVE_EXTERNAL`), Sourcify and ERC-7730 honest labeling.
* **Demo Observability (`demo-observability.test.ts` — 8 tests):** UI state machine transitions, timestamp captures, execution counts, and mode switching.

---

## 15. Limitations, Threat Model & Explicit Non-Claims

ActionProof adheres to strict security honesty:

1. **Level-3 Signing Binding is Outside MVP Scope:** ActionProof enforces Level-2 Request Binding across the EIP-1193 interface. It cannot verify what a wallet's hardware enclave or firmware signs internally.
2. **Public Endpoint Availability:** External services (Sourcify, GitHub, public RPCs) may experience rate limits, latency, or outages. ActionProof treats missing or failing external evidence as degraded (`WARNING` or `BLOCKED`), failing closed.
3. **Simulation State Limitations (TOCTOU):** `eth_call` executes against the current block state. State can change before block inclusion due to validator reordering, front-running, or slippage. A successful simulation is not a guarantee of mined transaction success.
4. **Zero Fabricated State Diffs or Token Balances:** Live `eth_call` simulation does not trace internal storage or token balance changes. The live adapter honestly reports empty asset changes (`[]`) and never fabricates balance diffs, gas estimates, or synthetic state mutations.
5. **Smart Contract Logic Bugs:** ActionProof decodes calldata and verifies contract identity, but cannot prevent economic failure (e.g. reentrancy or oracle manipulation) in verified contracts.
6. **Direct Provider Bypass:** If malicious code connects directly to external RPC endpoints without calling `window.ethereum`, an in-process provider proxy cannot intercept it.
7. **Unsupported Types Fail Closed:** Modern alternative write paths fail closed with `UNSUPPORTED`:
   * **ERC-4337:** `eth_sendUserOperation` is blocked at proxy boundary.
   * **EIP-7702:** `authorizationList` is rejected at schema validation.
   * **EIP-5792:** `wallet_sendCalls` is blocked as an unsupported method.
   * **EIP-4844:** Blob transactions are rejected at schema validation.
   * **Off-Chain Signatures:** `eth_signTypedData` and Permit/Permit2 signatures are out of MVP transaction scope.

---

## 16. Codebase Map & Subsystem Structure

```text
ActionProof/
├── docs/                                            # Comprehensive Documentation (12 Guides)
│   ├── 01-PROBLEM.md                                # Problem definition & Web3 pre-signing gap
│   ├── 02-SOLUTION.md                               # 4 core security questions & solution model
│   ├── 03-ARCHITECTURE.md                           # Subsystem hierarchy & in-process execution
│   ├── 04-SECURITY-MODEL.md                         # Trust boundaries, Level 1-3, fail-closed
│   ├── 05-RUNTIME-FLOW.md                           # 9-stage transaction lifecycle & sequence
│   ├── 06-THREAT-MODEL.md                           # Threat matrix & attack-defense hierarchy
│   ├── 07-EVIDENCE-PIPELINE.md                      # Evidence adapters & honest provenance
│   ├── 08-PROVIDER-BINDING.md                       # Level-2 binding invariant & pre-forward barrier
│   ├── 09-DEMO-SCENARIOS.md                         # 5 evaluator demo scenarios & execution matrix
│   ├── 10-LIMITATIONS.md                            # Scope boundaries & explicit non-claims
│   ├── 11-TECHNICAL-DEEP-DIVE.md                    # Canonicalization, freezing & determinism
│   └── 12-EVALUATOR-GUIDE.md                        # 5-minute evaluator quickstart guide
│
├── scripts/                                         # Read-Only Live Smoke Tests
│   ├── live-smoke-test.ts                           # Standalone live endpoint smoke test
│   └── test-swap-live.ts                            # Live swap transaction analysis script
│
├── src/                                             # Security Core & Implementation
│   ├── canonical/                                   # Normalization, schema & Keccak-256 commitments
│   │   ├── types.ts                                 # actionproof.request.v1 schema types
│   │   ├── schema.ts                                # Strict schema & type compatibility validation
│   │   ├── normalize.ts                             # Address, quantity, accessList normalizers
│   │   ├── serializer.ts                            # Deterministic fixed-order JSON serializer
│   │   └── commitment.ts                            # Canonicalization & Keccak-256 commitment hasher
│   │
│   ├── provider/                                    # EIP-1193 Provider Proxy & Enforcement
│   │   ├── types.ts                                 # Provider, barrier & verification result types
│   │   ├── proxy.ts                                 # ActionProofProviderProxy & pre-forward recheck
│   │   ├── snapshot.ts                              # Single-pass getter disarming & deep freeze
│   │   ├── barrier.ts                               # Deterministic synchronization barrier
│   │   ├── eip1193.ts                               # Standard EIP-1193 interface definitions
│   │   └── mockWallet.ts                            # Deterministic test wallet provider
│   │
│   ├── analysis/                                    # Independent Calldata Analysis
│   │   ├── decoder.ts                               # Trusted interface ABI decoder
│   │   ├── multicall.ts                             # Recursive multicall & approval inspector
│   │   ├── contract.ts                              # Sourcify contract verification (v2 API)
│   │   └── simulation.ts                            # State simulation (eth_call RPC adapter)
│   │
│   ├── intent/                                      # Intent Evidence & Matching
│   │   ├── erc7730.ts                               # ERC-7730 clear-signing adapter (GitHub registry)
│   │   ├── intent-provider.ts                       # Application intent capture interface
│   │   └── structured.ts                            # Structured intent definitions & categories
│   │
│   ├── evidence/                                    # Multi-Source Evidence Pipeline
│   │   ├── types.ts                                 # CompleteEvidence & evidence bundle schemas
│   │   └── pipeline.ts                              # EvidencePipeline & live pipeline factory
│   │
│   ├── policy/                                      # Deterministic Policy Engine
│   │   ├── rules.ts                                 # Deterministic rules (RULE_01-09)
│   │   └── engine.ts                                # DeterministicPolicyEngine evaluator
│   │
│   └── ui/                                          # Evaluator Security Console
│       ├── App.tsx                                  # Main React security dashboard
│       ├── runner.ts                                # DemoRunner execution state machine
│       ├── scenarios.ts                             # Evaluator scenario fixtures
│       ├── components/                              # UI components (EvidencePanel, ScenarioBar, etc.)
│       ├── main.tsx                                 # React application entrypoint
│       └── styles.css                               # Terminal UI styling
│
└── tests/                                           # Automated Test Suite (241 tests)
    ├── canonical/                                   # Normalization & schema tests (22 tests)
    ├── provider/                                    # Provider binding & mutation tests (104 tests)
    ├── analysis/                                    # Multicall & evidence honesty tests (14 tests)
    ├── policy/                                      # Policy determinism & RULE_04 tests (65 tests)
    ├── integration/                                 # End-to-end & live integration tests (28 tests)
    └── ui/                                          # Demo observability tests (8 tests)
```

---

## 17. Project Status & Future Roadmap

* **Current Status:** Released at commit [`734fd79`](https://github.com/Abhi010903/ActionProofETR/commit/734fd79b8b3f07e36bf0931557b9f1539bfbe296) and deployed live to [Cloudflare Pages](https://actionproof-etr.pages.dev). Level-2 Provider-Request Binding fully implemented and verified across 241 automated tests.
* **Roadmap Ahead:**
  * **Level-3 Wallet Firmware Integration:** Collaborate with wallet vendors to bind verified commitments directly into hardware enclave signing payloads.
  * **Live Archive Simulation:** Connect live simulation adapters to `debug_traceCall` archive nodes.
  * **EIP-7702 Delegation Validation:** Implement canonical validation for `authorizationList` signatures and delegation targets.
  * **EIP-5792 Support:** Extend canonical normalization to support `wallet_sendCalls` batch transactions.

---

## 18. Comprehensive Documentation Index

For technical depth, consult the dedicated guides in [`docs/`](docs/):

* [**01. Problem Definition**](docs/01-PROBLEM.md) — The Web3 pre-signing vulnerability gap and failure modes.
* [**02. Solution Architecture**](docs/02-SOLUTION.md) — The 4 core security questions and pre-signing enforcement paradigm.
* [**03. Subsystem Architecture**](docs/03-ARCHITECTURE.md) — Component hierarchy, in-process model, and subsystem breakdown.
* [**04. Security Model**](docs/04-SECURITY-MODEL.md) — Trust assumptions, Level 1–3 distinctions, and fail-closed posture.
* [**05. Runtime Flow**](docs/05-RUNTIME-FLOW.md) — 9-stage transaction lifecycle and sequence diagram.
* [**06. Threat Model**](docs/06-THREAT-MODEL.md) — Adversary threat matrix and attack-defense hierarchy.
* [**07. Evidence Pipeline**](docs/07-EVIDENCE-PIPELINE.md) — ABI decoding, multicall unrolling, and honest provenance tracking.
* [**08. Provider Binding**](docs/08-PROVIDER-BINDING.md) — Level-2 binding invariant, anti-accessor hardening, and barrier code.
* [**09. Demo Scenarios**](docs/09-DEMO-SCENARIOS.md) — The 5 evaluator demo scenarios and execution matrix.
* [**10. Scope & Limitations**](docs/10-LIMITATIONS.md) — MVP boundary, explicit non-claims, and future roadmap.
* [**11. Technical Deep Dive**](docs/11-TECHNICAL-DEEP-DIVE.md) — Canonicalization rules, freezing algorithms, and hashing.
* [**12. Evaluator Quickstart**](docs/12-EVALUATOR-GUIDE.md) — 5-minute testing guide for hackathon evaluators.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

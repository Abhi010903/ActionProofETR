# ActionProof — Evaluator Demo Scenarios & Execution Matrix

## 1. Primary Evaluator Scenarios Summary Table

| Scenario ID | Name & Attack Type | DApp Claim (Untrusted) | Calldata Semantics | Policy Verdict | Pre-Forward Barrier | Forwarded to Wallet? | Wallet Call Count |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SCENARIO-01** | **Normal Supported Swap** (Benign Baseline) | *"Swap 100 USDC for ETH on Uniswap V3"* | Valid `exactInputSingle` swap parameters | **`VERIFIED`** | Matches ($\mathcal{C}_{\text{fwd}} = \mathcal{C}_{\text{verified}}$) | **YES** | **1** |
| **SCENARIO-02** | **Hidden Unlimited Approval** (Deceptive Multicall) | *"Swap 100 USDC for ETH"* | `multicall` with hidden `approve(attacker, MAX_UINT)` | **`BLOCKED`** | N/A (Blocked at policy stage) | **NO** | **0** |
| **SCENARIO-03** | **Post-Verification Mutation** (In-Memory TOCTOU) | *"Swap 100 USDC for ETH"* | Valid calldata, but `to` mutated after verification | **`COMMITMENT_ MISMATCH`** | **Tripped!** ($\mathcal{C}_{\text{fwd}} \neq \mathcal{C}_{\text{verified}}$) | **NO** | **0** |
| **SCENARIO-04** | **Unknown Calldata** (Opaque Bytecode Exploit) | *"Claim Staking Rewards"* | Unrecognized selector `0x12345678...` | **`BLOCKED`** (UNKNOWN_CALLDATA) | N/A (Blocked at policy stage) | **NO** | **0** |
| **SCENARIO-05** | **Unsupported Type** (EIP-7702 Delegation) | *"Delegate Account Execution"* | Type-4 payload with `authorizationList` | **`UNSUPPORTED`** | N/A (Blocked at schema stage) | **NO** | **0** |

---

## 2. Detailed Scenario Walk-Throughs

### Scenario 1: Normal Supported Swap (Benign)
* **Goal:** Prove that legitimate, fully understood transactions pass verification and forward cleanly to the wallet.
* **Transaction Request:** 
  * `to`: `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` (Uniswap V3 SwapRouter02)
  * `data`: ABI-encoded `exactInputSingle((tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96))`
* **Analysis & Evidence:**
  * ABI Decoder recognizes `exactInputSingle`.
  * Sourcify confirms Uniswap contract verification.
  * Simulation fixture confirms expected token input/output balance deltas.
* **Result:** Verdict is `VERIFIED`. Barrier confirms matching commitment. Underlying wallet receives exactly **1** transaction request.

### Scenario 2: Hidden Unlimited Approval (Stealth Multicall)
* **Goal:** Demonstrate that ActionProof unrolls multicalls and catches malicious approvals concealed inside DeFi batches.
* **Transaction Request:**
  * `to`: `0xca11bde05977b3631167028862be2a173976ca11` (Multicall3)
  * `data`: `aggregate3` array containing:
    1. A normal token swap call.
    2. A stealth `erc20.approve(0xDeadBeef..., 0xffffffffffffffffffffffff)`.
* **Analysis & Evidence:**
  * Multicall inspector unpacks the batch and discovers the approval subcall.
  * Policy Engine applies `StealthApprovalRule`.
* **Result:** Verdict is `BLOCKED`. Execution halts immediately. The underlying wallet receives **0** calls.

### Scenario 3: Post-Verification Destination Mutation (TOCTOU)
* **Goal:** Demonstrate that ActionProof's Level-2 binding protects against in-memory tampering between verification and forwarding.
* **Transaction Request:**
  * Starts as a benign swap request.
  * Successfully passes policy verification.
  * In the demo harness, a mutation is injected into the outgoing payload, changing `to` from the Uniswap Router to an attacker's address.
* **Analysis & Evidence:**
  * The pre-forward barrier re-canonicalizes the outgoing request and recomputes the commitment.
  * $\mathcal{C}_{\text{fwd}} \neq \mathcal{C}_{\text{verified}}$.
* **Result:** Pre-forward barrier throws `ActionProofSecurityError("COMMITMENT_MISMATCH")`. Underlying wallet receives **0** calls.

### Scenario 4: Unknown Calldata (Fail-Closed Enforcement)
* **Goal:** Demonstrate that ActionProof never defaults to `VERIFIED` on un-decodable calldata.
* **Transaction Request:**
  * Target is an unverified contract address.
  * Calldata begins with an unrecognized 4-byte selector (`0x12345678`).
* **Analysis & Evidence:**
  * ABI decoder flags calldata as unrecognized.
  * Sourcify confirms contract is unverified.
  * `CalldataIntegrityRule` fires.
* **Result:** Verdict is `BLOCKED` with reason `UNKNOWN_CALLDATA`. Underlying wallet receives **0** calls.

### Scenario 5: Unsupported Protocol Features (EIP-7702)
* **Goal:** Demonstrate that modern alternative write paths are safely caught and rejected rather than blindly forwarded.
* **Transaction Request:**
  * Payload includes an `authorizationList` array (EIP-7702 account delegation).
* **Analysis & Evidence:**
  * Canonical schema validator parses request against `actionproof.request.v1`.
  * Schema detects unsupported fields.
* **Result:** Verdict is `UNSUPPORTED`. Underlying wallet receives **0** calls.

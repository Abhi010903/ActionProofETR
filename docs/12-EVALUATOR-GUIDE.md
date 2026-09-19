# ActionProof — Evaluator Quickstart & Testing Guide (5-Minute Evaluation)

## 1. Prerequisites & Installation

* **Node.js**: v18.0.0 or higher
* **Package Manager**: `npm` (v9+)
* **Terminal**: PowerShell / Bash / Zsh

Clone the repository and install dependencies:
```bash
git clone https://github.com/Abhi010903/ActionProofETR.git
cd ActionProofETR
npm install
```

---

## 2. Automated Verification Triad

Run the three automated verification checks to validate full type safety, test suite coverage, and build cleanliness:

### Step 1: Type Checking (Strict Zero-Error Verification)
```bash
npx tsc --noEmit
```
*Expected Result:* Zero errors, exits cleanly.

### Step 2: Automated Test Suite (86 Passing Tests)
```bash
npm test
```
*Expected Result:* All 86 tests across 7 test suites pass completely.

### Step 3: Production Build
```bash
npm run build
```
*Expected Result:* Vite compiles production assets into `dist/` in under 3 seconds.

---

## 3. Interactive Evaluator UI Walkthrough

Launch the interactive local demonstration dashboard:
```bash
npm run dev
```
Open your browser to `http://localhost:5173` (or the port indicated in your console).

### The Evaluator Workflow:

#### 1. Select a Scenario Card
Click on any of the five scenario cards on the left panel:
* **Scenario 1:** Normal Supported Swap (Benign)
* **Scenario 2:** Hidden Unlimited Approval in Multicall (Attack)
* **Scenario 3:** Post-Verification Destination Mutation (Attack)
* **Scenario 4:** Unknown Calldata (Attack)
* **Scenario 5:** Unsupported EIP-7702 Delegation (Attack)

#### 2. Observe the `READY / UNEXECUTED` State
Notice that upon selecting a scenario, the execution pipeline does **not** auto-trigger. 
The right-hand panel displays a **Staged Request Preview** card showing:
* Status badge: `READY`
* Staged Target Address and Calldata
* Explanation of what will be tested

#### 3. Click `🛡️ Intercept & Verify Request`
Click the primary execution button. ActionProof will:
1. Dispatch the request to the `ActionProofProviderProxy`.
2. Take an anti-accessor deep freeze snapshot.
3. Compute the canonical commitment hash.
4. Execute the evidence pipeline (ABI decoding, multicall unrolling, simulation).
5. Run the deterministic policy rules and issue a verdict.
6. Verify the pre-forward barrier.
7. Either forward to the mock wallet or halt execution.

#### 4. Observe Execution Telemetry
The UI immediately updates with:
* **Status Badge:** `COMPLETED`
* **Execution Counter:** e.g., `Execution #1`
* **Live Timestamp:** Real-time runtime timestamp (e.g., `15:04:32.418`)
* **Policy Verdict:** `VERIFIED`, `BLOCKED`, `COMMITMENT_MISMATCH`, or `UNSUPPORTED`.
* **Mock Wallet Call Counter:**
  * For Scenario 1: Wallet receives **1** call.
  * For Scenarios 2–5: Wallet receives **0** calls.

#### 5. Click `🔄 Re-Execute Gate`
Click the re-execute button to re-run the scenario through the live provider proxy. Notice the execution counter increment to `Execution #2` and the timestamp refresh, proving live in-process execution.

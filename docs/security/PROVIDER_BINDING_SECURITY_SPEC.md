# ActionProof — Provider Binding Security Specification

## 1. Security Claim & Boundary

### The Level-2 Guarantee
Within an integration where ActionProof owns the EIP-1193 provider path to the wallet, the immutable forwarded transaction request is canonical-equivalent to the request whose commitment was verified under the actionproof.request.v1 schema.

```text
commitment(canonical(verified_request)) == commitment(canonical(forwarded_snapshot))
```

If the invariant holds, the immutable snapshot is forwarded to the wallet.
If the invariant fails, forwarding is blocked: the wallet receives **nothing**.

### The Three Security Levels
- **Level 1: Semantic Transaction-Request Identity** — Captures sender, destination, value, calldata, and chain context.
- **Level 2: Canonical Transaction-Request Binding** (MVP Boundary) — Proves that the immutable forwarded transaction request is canonical-equivalent to the request verified by ActionProof.
- **Level 3: Final Wallet Signing Payload Binding** (Outside MVP) — The exact RLP-serialized bytes or signing payload signed by the wallet private key is **NOT PROVEN**. Wallets may re-estimate gas, re-order fees, select nonces, or present editable confirmation modals.

### Explicit Non-Claims
1. **Level-3 (Signed Payload):** ActionProof does not claim to prove what an arbitrary wallet signs after receiving the provider request.
2. **Provider Bypass:** If a DApp bypasses ActionProof by acquiring an alternate unproxied provider reference, ActionProof cannot intercept it.
3. **Smart Contract Safety:** Sourcify source verification, ERC-7730 descriptors, and EVM simulations are evidence, not mathematical safety proofs.
4. **Unknown Calldata:** "ActionProof detected no known malicious behavior" is NOT equivalent to "ActionProof verified the transaction as safe." Transactions with un-decodable calldata fail closed as `BLOCKED`.

---

## 2. Canonical Request Domain (`actionproof.request.v1`)

### Supported Transaction Classes
- Type 0: Legacy transaction form
- Type 1: EIP-2930 transaction form (with optional access lists)
- Type 2: EIP-1559 transaction form (with maxFeePerGas / maxPriorityFeePerGas)

### Supported Field Schema
- `domain`: Constant string `'actionproof.request.v1'`
- `type`: `'0x0'`, `'0x1'`, or `'0x2'`
- `from`: Normalized 20-byte lowercase hex address
- `to`: Required 20-byte lowercase hex address (contract creation is unsupported in MVP)
- `value`: Normalized Ethereum quantity (`'0x0'` for zero; omitted = `'0x0'`)
- `data`: Normalized lowercase even-length byte hex (`'0x'` if omitted)
- `chainId`: Integer matching the trusted active provider chain context
- `nonce`: Normalized quantity or `null`
- `gas`: Normalized quantity or `null`
- `gasPrice`: Normalized quantity or `null`
- `maxFeePerGas`: Normalized quantity or `null`
- `maxPriorityFeePerGas`: Normalized quantity or `null`
- `accessList`: Deterministically sorted array of `{ address, storageKeys }`

### Known Unsupported Fields / Transaction Classes
The canonicalizer rejects:
- `maxFeePerBlobGas`
- `blobVersionedHashes`
- `authorizationList` (EIP-7702)
- Transaction types outside `'0x0'`, `'0x1'`, `'0x2'`
- Contract creation (`to` omitted)

Any unknown property is immediately rejected (`UNKNOWN_FIELD:<key>`).

---

## 3. Pre-Forward Recheck & Boundary Hardening Algorithm

Immediately before invoking the underlying wallet provider's `eth_sendTransaction`, ActionProof executes:

```ts
// 1. Snapshot and commit at initial entry
const snapshot = createImmutableSnapshot(liveRequest);
const verifiedCommitment = computeCommitment(snapshot, activeChainId);

// 2. Gather multi-source evidence and evaluate deterministic policy
const evidence = await runPipeline(snapshot);
if (evidence.policy.verdict === 'BLOCKED' || evidence.policy.verdict === 'UNSUPPORTED') {
  return blockRequest();
}

// 3. Synchronization barrier hook (for deterministic test synchronization, e.g. Test 7)
await barrier(liveRequest);

// 4. Create an immutable forwarding snapshot immediately prior to pre-forward recheck.
// This neutralizes adversarial ES6 getter/proxy mutators that yield divergent values on subsequent reads.
const forwardPayload = createImmutableSnapshot(liveRequest);

// 5. Pre-forward recheck: synchronous re-canonicalization of the exact snapshot about to be forwarded
const forwardCommitment = computeCommitment(forwardPayload, activeChainId);

// 6. Invariant enforcement: verified commitment MUST exactly match pre-forward commitment
if (forwardCommitment.hash !== verifiedCommitment.hash) {
  return blockRequest('COMMITMENT_MISMATCH');
}

// 7. Forward ONLY the rechecked, immutable snapshot to the wallet provider
return wallet.request({ method: 'eth_sendTransaction', params: [forwardPayload] });
```

No external async callbacks, timers, or event loops may intervene between step 5, 6, and 7.
Forwarding the frozen snapshot `forwardPayload` guarantees that no post-check mutation or hostile accessor can alter parameters en route to the wallet.

---

## 4. Evidence Provenance & Simulation Honesty

ActionProof strictly labels the provenance of all supporting evidence:

- **EVM Simulation:**
  - Default: `UnavailableSimulationAdapter` (`provenance: 'UNAVAILABLE'`). Honest Ethereum pre-signing MVP without active EVM node emits `WARNING` (degraded evidence).
  - Explicit Fixture: `LocalFixtureSimulationAdapter` (`provenance: 'LOCAL_FIXTURE'`).
  - Live RPC: `LiveRPCSimulationAdapter` (`provenance: 'LIVE_BACKEND'`).
  - ActionProof *never* manufactures synthetic simulation execution from calldata.
- **Contract Verification:**
  - Labeled `provenance: 'LOCAL_FIXTURE'` (local verified source correspondence fixture) or `'LIVE_EXTERNAL'` (Sourcify API). Explicitly documents compiler correspondence vs smart contract safety.
- **ERC-7730 Clear-Signing:**
  - Labeled `provenance: 'LOCAL_FIXTURE'` or `'LIVE_REGISTRY'`. Advisory evidence only, with deterministic cross-validation against decoded calldata.
- **Approval Classification:**
  - Strictly distinguishes `EXACT_UNLIMITED` (`amount === uint256.max`) from `HIGH_VALUE_APPROVAL` (`amount >= threshold`).

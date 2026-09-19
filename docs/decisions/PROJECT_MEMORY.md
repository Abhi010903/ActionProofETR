# ActionProof — Frozen Project Memory & Architectural Invariants

## Permanent Architectural Decisions

1. **Untrusted Frontend Assertions:** DApp display text is an untrusted claim. Verification always performs independent calldata decoding.
2. **Immutable Snapshots:** Verification algorithms operate on deep-cloned, recursively frozen snapshots, shielding internal analysis from concurrent object mutations.
3. **Level-2 Request Binding:** The MVP security boundary is Level-2 (transaction-request binding). Level-3 (final signed payload) is explicitly outside MVP.
4. **Keccak-256 Production Standard:** Production commitments use Ethereum Keccak-256 via `viem`. SHA-256 was used in earlier zero-dependency PoCs for control flow demonstration only.
5. **No Silent Field Dropping:** Every supported supplied property is included in the canonical commitment domain. Unknown properties are rejected.
6. **Fail-Closed Unsupported Paths:** Known unsupported write paths (EIP-7702 `authorizationList`, EIP-5792 `wallet_sendCalls`, blob transactions) produce `UNSUPPORTED` and are never forwarded.
7. **Advisory Semantic Evidence:** ERC-7730 v2 descriptors provide advisory semantic evidence. A descriptor's existence does not equate to transaction safety.
8. **Contract Identity vs. Safety:** Sourcify source/bytecode correspondence confirms compiler integrity, not smart contract safety or absence of backdoors.
9. **Simulation TOCTOU Limitation:** Simulation provides state-specific execution evidence at an explicit block. It is not a guarantee of future on-chain state if reorgs or pending mempool transactions intervene.
10. **Deterministic Policy Authority:** Security verdicts (`VERIFIED`, `WARNING`, `BLOCKED`, `UNSUPPORTED`) are computed exclusively by pure deterministic rules. LLMs are strictly forbidden from determining security verdicts.
11. **Provider Bypass Limitation:** The guarantee is valid only when ActionProof owns the DApp-to-wallet provider path. Direct provider bypass is an explicit architectural boundary limitation of JavaScript wrappers.
12. **Honest Simulation Provenance:** ActionProof defaults to `UnavailableSimulationAdapter` (`provenance: 'UNAVAILABLE'`) when no live EVM simulation backend is attached. Synthetic simulation outcomes are never manufactured from calldata. Policy flags `UNAVAILABLE` as `WARNING` (degraded evidence).
13. **Provider Boundary Hardening:** The provider proxy creates an immutable snapshot immediately prior to pre-forward recheck and forwards that exact snapshot to the underlying wallet, neutralizing dynamic getter/accessor mutation vectors.
14. **Approval Classification:** Terminology distinguishes `EXACT_UNLIMITED` (`amount === uint256.max`) from `HIGH_VALUE_APPROVAL` (`amount >= threshold`), evaluated by independent policy rules.
15. **Level-2 Claim Precision:** The Level-2 guarantee is strictly: *"Within an integration where ActionProof owns the EIP-1193 provider path to the wallet, the immutable forwarded transaction request is canonical-equivalent to the request whose commitment was verified under the actionproof.request.v1 schema."* Level-3 (final wallet signing payload / serialized bytes) is NOT PROVEN.
16. **Unknown Top-Level Calldata Policy:** Top-level calldata that cannot be independently decoded fails closed as `BLOCKED` by default (`RULE_08_CALLDATA_DECODING_STATUS`). ActionProof explicitly recognizes that *"ActionProof detected no known malicious behavior"* is NOT equivalent to *"ActionProof verified the transaction as safe."*



# ActionProof — Final Phase Plan

## Phase 0 — Research / Kill Test

**Status: COMPLETE.**

Acceptance:

- critical standards checked;
- current status of ERC-7730 and ERC-8265 recorded;
- provider bypass documented;
- transaction classes documented;
- licensing checked;
- differentiation survives the kill test.

## Phase 1 — Provider Proxy + Request Binding

Implement only:

1. local EIP-1193 provider interface;
2. ActionProof proxy;
3. strict transaction schema;
4. deterministic canonical serializer;
5. Keccak-256 commitment adapter;
6. immutable snapshot;
7. explicit verification barrier;
8. pre-forward recheck;
9. mock wallet;
10. provider-binding tests.

**Gate:** all Phase 1 security tests pass and blocked requests never reach the wallet.

## Phase 2 — Transaction Core + Decode

- ABI decoding;
- recursive supported multicall;
- call-tree evidence;
- approval detection.

**Gate:** malicious nested approval fixture is deterministically identified.

## Phase 3 — Contract Evidence

- Sourcify adapter;
- source/bytecode evidence;
- proxy implementation evidence where practical.

**Gate:** contract evidence is clearly labeled as evidence, not safety proof.

## Phase 4 — ERC-7730

- ERC-7730 v2 adapter;
- registry resolution;
- descriptor validation;
- descriptor-vs-independent-decode comparison.

**Gate:** descriptor absence/mismatch cannot silently produce `VERIFIED`.

## Phase 5 — Simulation

- Temper or equivalent adapter;
- explicit block/state context;
- simulation failure handling;
- asset movement evidence.

**Gate:** UI never presents simulation as future certainty.

## Phase 6 — Comparison + Policy

- declared vs decoded vs descriptor vs simulated effects;
- pure deterministic policy;
- verdict reasons.

**Gate:** same fixture produces same verdict repeatedly.

## Phase 7 — Evidence UI

Show:

- request identity;
- binding status;
- call tree;
- contract evidence;
- clear-signing evidence;
- simulation context;
- policy reason.

## Phase 8 — Attack Lab

Required demos:

- hidden approval;
- destination mutation;
- calldata mutation;
- value mutation;
- provider bypass as an explicitly out-of-boundary demonstration;
- unsupported modern write path.

## Phase 9 — Integration / Freeze

- end-to-end normal flow;
- end-to-end blocked flow;
- deterministic fixtures;
- dependency/license audit;
- documentation audit;
- 2–3 minute demo.

No phase may silently expand the security claim.

# ActionProof — Final Build Specification

**Ecosystem:** Ethereum  
**Hackathon:** Crypto World's Fair 2026  
**Package status:** Research-validated, security-boundary frozen, pre-implementation  
**Audit date:** 2026-09-19  

## Purpose

This package is the final pre-implementation baseline for ActionProof. It supersedes the earlier v1 package. It incorporates the final research/kill-test pass covering EIP-1193, EIP-1474, typed transaction envelopes, EIP-7702, EIP-5792, ERC-4337, EIP-712, ERC-7730, txKit/ERC-8265, DappFence, WEBCAT, Sourcify, Temper, ERC-7730 Analyzer, and Veryclear.

The package is **not a claim that ActionProof makes Ethereum transactions safe**. It defines the smallest defensible system we can build and demo.

## Read order

1. `08_FINAL_SECURITY_AUDIT.md` — why this package is frozen this way
2. `07_PROVIDER_BINDING_SECURITY_SPEC.md` — authoritative security invariant
3. `01_PRD.md`
4. `02_ARCHITECTURE.md`
5. `03_ENGINEERING_RULES.md`
6. `04_PHASE_IMPLEMENTATION_PLAN.md`
7. `05_DESIGN_DOCUMENT.md`
8. `06_PROJECT_MEMORY.md`
9. `00_RESEARCH_GAP_MATRIX.md`
10. `09_SCOPE_FREEZE.md`
11. `THIRD_PARTY_NOTICES.md`
12. `reference/` — proof-of-concept only, not production code

## Final product statement

> **ActionProof is a controlled EIP-1193 pre-signing enforcement layer that captures an `eth_sendTransaction` request, independently analyzes supported transaction meaning and execution evidence, applies deterministic policy, and rechecks a canonical request commitment immediately before forwarding the request to the wallet provider.**

Within the controlled integration, a matching commitment means the request being forwarded is identical under ActionProof's defined canonical request domain to the request that was verified.

It does **not** prove the final signed transaction bytes, wallet behavior after the provider boundary, or global transaction safety.

## Final MVP boundary

### Supported

- controlled EIP-1193 provider proxy
- `eth_sendTransaction`
- transaction-request canonicalization and Keccak-256 commitment
- strict schema validation; no silent field dropping
- deterministic pre-forward recheck
- deterministic mutation tests
- legacy / EIP-2930 / EIP-1559 request forms needed by the demo
- independent ABI decoding
- one or more explicitly supported multicall wrappers
- unlimited ERC-20 approval detection in supported decoded calls
- contract/source evidence through an adapter such as Sourcify
- ERC-7730 **v2** adapter abstraction; descriptor is advisory evidence
- simulation evidence with explicit block/state context
- deterministic comparison and policy
- evidence UI
- normal + hidden-approval + mutation demos

### Explicitly unsupported in MVP

- `wallet_sendCalls` / EIP-5792
- EIP-7702 authorization-list transactions
- ERC-4337 UserOperations
- generic EIP-712 / Permit / Permit2 signing flows
- blob transaction execution analysis
- contract-creation transactions
- arbitrary provider bypass protection
- arbitrary third-party DApp protection without earlier provider interception
- final signed-payload binding
- browser-extension packaging
- hardware-wallet integration
- L2-specific security guarantees
- economic/profitability/safety guarantees

Unsupported requests must produce `UNSUPPORTED` or be rejected before wallet forwarding; they must never silently fall into the supported policy path.

## Core invariant

```text
commitment(canonical(verified_request))
==
commitment(canonical(request_about_to_be_forwarded))
```

The comparison occurs immediately before the wallet-provider call. A mismatch is `BLOCKED` and the wallet is not called.

## Three security levels

```text
LEVEL 1 — Semantic transaction identity
Meaningful execution fields and network context.

LEVEL 2 — Transaction-request binding  ← MVP
The request verified by ActionProof matches the request forwarded by ActionProof.

LEVEL 3 — Final signing-payload binding
The exact typed/RLP serialized transaction signed by the wallet.
```

**MVP = Level 2.** Level 3 requires a wallet/signing boundary that exposes or controls the complete signing payload.

## Verdicts

- `VERIFIED` — all mandatory checks pass and provider-bound request binding is established.
- `WARNING` — no explicit mismatch, but evidence is unavailable/degraded and policy permits continuation.
- `BLOCKED` — deterministic mismatch or policy violation.
- `UNSUPPORTED` — outside the defined security model.

LLMs may explain evidence. They never emit the authoritative verdict.

## Freeze rule

No implementation should begin until the owner approves this final specification. Once Phase 1 starts, implementation changes that alter the trust model, commitment domain, verdict semantics, or scope require an explicit security-spec revision rather than silent engineering changes.

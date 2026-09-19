# ActionProof — Scope Freeze

**Freeze date:** 2026-09-19

This document prevents scope drift during implementation.

## MUST exist in the hackathon MVP

- controlled EIP-1193 provider proxy;
- `eth_sendTransaction` interception;
- strict request schema;
- versioned deterministic canonicalization;
- Keccak-256 request commitment;
- immutable verification snapshot;
- deterministic pre-forward recheck;
- mutation tests;
- independent ABI decoding;
- supported recursive multicall decoding;
- hidden unlimited-approval detection;
- contract/source evidence;
- ERC-7730 v2 evidence adapter;
- simulation evidence with state context;
- deterministic comparison;
- deterministic policy;
- evidence UI;
- normal + attack demos.

## MUST NOT silently enter the MVP

- EIP-5792 `wallet_sendCalls`;
- EIP-7702 authorization lists;
- ERC-4337 UserOperations;
- generic EIP-712 signing;
- Permit/Permit2;
- blob transactions;
- contract creation;
- arbitrary provider bypass protection;
- browser extension;
- wallet firmware/hardware integration;
- final signed-byte commitment;
- L2-specific claims;
- economic safety scoring;
- LLM verdicts.

## Claim freeze

The project may say:

> "ActionProof binds the supported transaction request it verifies to the supported request it forwards, within its controlled EIP-1193 provider boundary."

The project may not say:

> "ActionProof guarantees the transaction the wallet signs is exactly the transaction ActionProof verified."

The project may not say:

> "ActionProof proves the transaction is safe."

## Change control

If implementation discovers a contradiction with this scope, stop at the current phase and update the security specification before continuing. Do not solve the contradiction by weakening a security invariant.

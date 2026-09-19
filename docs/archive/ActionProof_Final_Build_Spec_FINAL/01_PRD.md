# ActionProof — Product Requirements Document

## 1. Product definition

ActionProof is a pre-signing Ethereum transaction verification layer for a **controlled EIP-1193 provider integration**. It captures a supported `eth_sendTransaction` request, independently derives transaction evidence, applies deterministic policy, and prevents forwarding when a deterministic violation is detected.

## 2. Core question

> Is the supported transaction request ActionProof verified the same request ActionProof is about to forward, and does independent evidence support the application's claimed action?

The phrase **transaction-request binding** is mandatory. Do not call this final signed-transaction binding.

## 3. Trust model

### Untrusted

- DApp UI text
- DApp-declared intent
- single-provider RPC responses
- external metadata
- ERC-7730 descriptor contents
- producer-supplied metadata
- simulation output as a prediction of future state
- LLM output

### Deterministically derived

- captured request snapshot
- canonical representation
- request commitment
- decoded call tree, given a selected ABI
- deterministic comparison

### External evidence

- Sourcify source/bytecode verification
- ERC-7730 registry/descriptor evidence
- simulation state/results
- optional frontend provenance

External evidence can inform policy but never turns an unsafe or mismatched request into `VERIFIED` by itself.

## 4. Functional requirements

### FR-01 Capture

Intercept supported `eth_sendTransaction` requests before they reach the wallet provider.

### FR-02 Strict schema

Reject unknown transaction properties. Reject known but unsupported transaction types/fields. Never silently drop a field.

### FR-03 Canonicalization

Normalize supported transaction requests deterministically.

### FR-04 Commitment

Compute a versioned Keccak-256 commitment over the canonical request domain.

### FR-05 Immutable verification

Run all verification against a deep/immutable snapshot, never against a mutable live object.

### FR-06 Independent decoding

Decode supported calldata independently of the DApp's display text.

### FR-07 Recursive analysis

Recursively inspect explicitly supported multicall/batch wrappers.

### FR-08 Contract evidence

Use an external contract verification adapter such as Sourcify when available.

### FR-09 Clear-Signing evidence

Use ERC-7730 v2 through an adapter. A descriptor is advisory evidence and must be compared with independent decoding.

### FR-10 Simulation

Simulate with explicit block/state context and expose that context in evidence.

### FR-11 Deterministic comparison

Compare declared, decoded, descriptor and simulated evidence using deterministic rules.

### FR-12 Policy

Only deterministic code can emit `VERIFIED`, `WARNING`, `BLOCKED`, or `UNSUPPORTED`.

### FR-13 Pre-forward recheck

Immediately before forwarding, recompute the commitment over the request that will actually be passed to the wallet provider.

### FR-14 Fail closed on mismatch

Any commitment mismatch blocks forwarding.

## 5. Verdict semantics

### VERIFIED

All mandatory MVP checks pass, the request is supported, and provider-bound request binding is established.

### WARNING

No explicit violation was detected, but policy-permitted evidence is incomplete/degraded.

### BLOCKED

A deterministic mismatch, unsupported dangerous condition under policy, or explicit mutation was detected.

### UNSUPPORTED

The request uses a transaction/write/signing model outside MVP coverage.

## 6. MVP demo

Normal:

`Swap 100 USDC → ETH` → capture → decode → evidence → simulate → policy → commitment recheck → `VERIFIED` → wallet.

Attack:

same displayed action but supported multicall contains `approve(attacker, MAX_UINT256)` → recursive decode → undeclared dangerous call → `BLOCKED` → wallet receives nothing.

Mutation:

request destination/calldata/value/chain changes after verification → commitment mismatch → `BLOCKED` → wallet receives nothing.

## 7. Non-goals

ActionProof is not:

- a wallet;
- custody;
- a blockchain;
- a generic RPC provider;
- a universal smart-contract auditor;
- an ERC-7730 replacement;
- a DappFence/WEBCAT replacement;
- a txKit/ERC-8265 replacement;
- a universal account-abstraction security layer;
- an economic safety oracle;
- an AI security authority.

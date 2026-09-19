# ActionProof — Final Design Document

## Design principle

Evidence first. The interface should look like a transaction-security console, not a generic crypto dashboard.

## Primary screen

```text
ACTIONPROOF

REQUEST BINDING
✓ Captured at provider boundary
✓ Canonical request commitment
✓ Pre-forward commitment matches

DECLARED ACTION
Swap 100 USDC → ETH

ACTUAL CALL TREE
1. Router.swap(...)
2. Token.approve(attacker, MAX_UINT256)  ← unexpected

CONTRACT EVIDENCE
Source/bytecode correspondence: available

CLEAR SIGNING
ERC-7730 v2 descriptor: found / absent / mismatch

SIMULATION
State/block: <explicit context>
Observed effects: ...

POLICY
Unexpected unlimited approval

VERDICT
BLOCKED

WALLET FORWARDED
NO
```

## Required status language

Use:

- VERIFIED
- WARNING
- BLOCKED
- UNSUPPORTED

Never use:

- 100% SAFE
- GUARANTEED SAFE
- ZERO RISK
- PROVEN SAFE

## Binding panel

Always show both:

**Request binding:** verified request equals forwarded request under ActionProof's canonical request domain.

**Final signed payload:** `OUTSIDE MVP`.

## Demo Lab

1. normal swap;
2. hidden approval in supported multicall;
3. post-verification destination/data/value mutation;
4. unsupported `wallet_sendCalls` or EIP-7702 request.

The UI must show the exact deterministic evidence causing the verdict.

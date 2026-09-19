# ActionProof — Frozen Project Memory

## Identity

ActionProof is an Ethereum pre-signing transaction-security gate for a controlled EIP-1193 provider integration.

## Permanent decisions

1. DApp display text is an untrusted claim.
2. The provider request is captured before analysis.
3. Verification uses an immutable snapshot.
4. The MVP security property is Level-2 transaction-request binding.
5. Level-3 final signed-payload binding is outside MVP.
6. Production request commitments use Keccak-256.
7. Unknown transaction fields are never silently ignored.
8. Known unsupported transaction classes/fields fail closed as `UNSUPPORTED`.
9. ERC-7730 v2 is advisory evidence, not absolute truth.
10. Sourcify is source/bytecode evidence, not a safety certificate.
11. Simulation is state-specific evidence, not prophecy.
12. DappFence/WEBCAT are frontend provenance prior art, not transaction correctness.
13. Veryclear source is not approved for reuse without a verified compatible license.
14. ERC-7730 Analyzer is prior art for descriptor auditing; its LLM verdict architecture is not ActionProof's authority.
15. txKit/ERC-8265 is envelope prior art; it is not assumed to solve live provider binding.
16. LLMs never determine the final security verdict.
17. EIP-5792, EIP-7702, ERC-4337 and generic EIP-712/Permit flows are outside MVP.
18. Provider bypass is an explicit boundary limitation.

## Provider invariant

```text
commitment(canonical(verified_request))
==
commitment(canonical(request_about_to_be_forwarded))
```

The equality must hold immediately before the wallet-provider call.

## Final product claim

ActionProof can establish the above equality **only inside the controlled provider boundary**. It cannot establish what an arbitrary wallet signs after receiving the request.

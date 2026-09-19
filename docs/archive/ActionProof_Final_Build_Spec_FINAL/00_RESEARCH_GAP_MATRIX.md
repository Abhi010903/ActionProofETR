# ActionProof — Research / Gap / Reuse Matrix

## Research conclusion

ActionProof is not positioned as a replacement for any one Ethereum primitive. Its defensible boundary is the **live, deterministic enforcement point at a controlled EIP-1193 `eth_sendTransaction` provider boundary**.

| Project / standard | Current role | ActionProof decision |
|---|---|---|
| EIP-1193 | Provider API + adversarial provider model | Security boundary definition |
| EIP-1474 | RPC transaction request fields | Canonicalization reference |
| EIP-2718 | Typed transaction envelope | Transaction-class boundary |
| EIP-1559 | Type-2 fields | Supported request class |
| EIP-4844 | Blob transaction fields | Out of MVP |
| EIP-7702 | Type-4 authorization list | Out of MVP; fail closed |
| EIP-5792 | `wallet_sendCalls` | Out of MVP; explicit bypass path |
| ERC-4337 | UserOperation/bundler model | Out of MVP |
| EIP-712 | Structured-data signing | Out of MVP |
| ERC-7730 v2 | Clear-Signing descriptor format | Advisory semantic evidence via adapter |
| ERC-7730 Registry | Descriptor distribution | Evidence source |
| ERC-7730 Analyzer | Descriptor auditing | Prior art; do not duplicate its LLM verdict architecture |
| DappFence | Frontend resource integrity | Optional provenance adapter |
| WEBCAT | Browser app integrity/transparency | Prior art; no MVP dependency |
| Sourcify | Contract/source verification | Contract evidence adapter |
| Temper | EVM simulation | Simulation adapter |
| txKit / ERC-8265 | Prepared transaction envelope | Prior art; no assumption that binding is solved |
| Veryclear | Hardware/ZK clear-signing flow | Architecture study only; no source reuse |

## Differentiation test

The project should be dropped or redesigned if an open implementation is found that already provides the same complete workflow:

```text
live eth_sendTransaction capture
+
independent transaction analysis
+
explicit evidence model
+
 deterministic policy
+
pre-forward canonical request binding
+
BLOCK before wallet forwarding
```

The current research did not identify such an implementation.

## Important non-novelty statement

The following are deliberately treated as existing technology:

- Keccak-256
- EIP-1193 provider APIs
- ABI decoding
- ERC-7730 descriptors
- contract source verification
- transaction simulation
- frontend integrity
- transaction envelopes

ActionProof's value is their constrained orchestration and enforcement at the request boundary.

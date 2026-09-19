# ActionProof — Final Security / Scope Audit

**Audit date:** 2026-09-19  
**Input:** `ActionProof_Final_Build_Spec_v1(1).zip`  
**Result:** BUILD — with the security model frozen below.

## 1. Final research conclusions

### EIP-1193

EIP-1193 defines the provider API and explicitly warns that the Provider object exists in an adversarial JavaScript environment: its properties can be read or overwritten, and consumers should treat it as adversary-controlled. Therefore ActionProof's guarantee is only valid when the proxy actually owns the DApp-to-wallet path. A DApp that retains or obtains another provider can bypass ActionProof. This is a boundary limitation, not a solved attack.

Source: https://eips.ethereum.org/EIPS/eip-1193

### EIP-1474 / transaction request fields

`eth_sendTransaction` accepts transaction fields including `from`, optional `to`, `gas`, `gasPrice`, `value`, `data`, and `nonce`. Modern typed transactions add fields such as access lists, EIP-1559 fee fields, blob fields, and EIP-7702 authorization lists. ActionProof therefore MUST NOT use a tiny hand-picked field list while silently ignoring all other properties.

Source: https://eips.ethereum.org/EIPS/eip-1474

### EIP-2718 / EIP-1559 / EIP-4844 / EIP-7702

Typed transaction envelopes are real protocol-level transaction classes. EIP-7702 is **Final** and introduces a type-4 transaction with an authorization list that can change an EOA's delegated code. It is security-significant and is outside the MVP. Blob transactions are also outside the MVP.

Sources:
- https://eips.ethereum.org/EIPS/eip-2718
- https://eips.ethereum.org/EIPS/eip-1559
- https://eips.ethereum.org/EIPS/eip-4844
- https://eips.ethereum.org/EIPS/eip-7702

### EIP-5792

EIP-5792 is **Final** and defines `wallet_sendCalls`, which lets applications send batches of calls through wallet APIs. It is a real alternative write path and therefore creates a clear scope boundary: the MVP protects `eth_sendTransaction`, not all modern wallet write APIs.

Source: https://eips.ethereum.org/EIPS/eip-5792

### ERC-4337

ERC-4337 is **Final** and uses `UserOperation` objects sent to bundlers rather than ordinary `eth_sendTransaction` semantics. It is outside the MVP and must not be represented as if provider binding covers it.

Source: https://eips.ethereum.org/EIPS/eip-4337

### EIP-712

EIP-712 is a final structured-data signing standard. It covers typed messages, not ordinary transaction execution. Permit/Permit2 and other typed-signature flows therefore require a separate capture/verification model and remain outside the MVP.

Source: https://eips.ethereum.org/EIPS/eip-712

### ERC-7730

ERC-7730 remains **Draft**. Its released schema `2.0.0` is Active, `1.0.0` is Deprecated, and `3.0.0-next` is a mutable draft. New integrations should target the Active version. ActionProof therefore uses an adapter targeting v2 and never hard-codes the whole architecture to the draft's evolving schema.

Source: https://eips.ethereum.org/EIPS/eip-7730

### ERC-7730 Registry

The registry is real, active and CC0-1.0. It publishes calldata/EIP-712 descriptor indexes and descriptors. Registry presence is evidence, not a proof that the descriptor truthfully represents contract behavior.

Source: https://github.com/ethereum/clear-signing-erc7730-registry

### ERC-7730 Analyzer

The current analyzer is a real CC0-1.0 project. It performs descriptor parsing, transaction retrieval, ABI decoding, source extraction, optional Ledger screenshot capture and LLM-based descriptor auditing. It overlaps with ActionProof's evidence layer but does not replace the live provider-bound deterministic gate defined here.

Source: https://github.com/LedgerHQ/erc7730-analyzer

### DappFence

DappFence is real and MIT licensed. Its focus is cryptographic frontend-file integrity/provenance using signed manifests and a service worker. It is complementary to ActionProof and is not required for the core provider-binding claim.

Source: https://github.com/coinspect/dappfence

### WEBCAT

WEBCAT is real, MIT licensed and explicitly experimental/alpha. It provides a broader browser application integrity/transparency framework. It is prior art for frontend integrity, not a reason to expand ActionProof's MVP.

Source: https://github.com/freedomofpress/webcat

### Sourcify

Sourcify is real and MIT licensed. It verifies source/metadata correspondence to deployed contract bytecode under its verification model. It does not establish contract safety.

Source: https://github.com/argotorg/sourcify

### Temper

Temper is real and MIT licensed. It provides HTTP-accessible Ethereum transaction simulation against a local EVM. Simulation remains state-specific evidence rather than a proof of future mainnet execution.

Source: https://github.com/EnsoFinance/temper

### txKit / ERC-8265

txKit is real and MIT licensed. ERC-8265 is still a Draft proposal for prepared transaction envelopes. The envelope model materially overlaps with ActionProof's evidence/semantic layer, but it does not remove the need to define the live provider-bound enforcement boundary used by this project. ActionProof will not claim that txKit or ERC-8265 has already solved Level-2 provider binding.

Sources:
- https://github.com/txkit/mono
- https://github.com/ethereum/ERCs/pull/1753

### Veryclear

The Veryclear repository is real. The current repository page does not expose a public LICENSE file. Therefore source reuse is not approved. Its architecture and trust model may be studied as prior art only.

Source: https://github.com/lfglabs-dev/explain.md

## 2. Kill-test result

The project remains defensible only at this boundary:

> **controlled live `eth_sendTransaction` request capture + deterministic evidence correlation + pre-forward request-binding enforcement.**

No reviewed open project was found to collapse that exact boundary into the same complete ActionProof workflow.

This is a composition/integration claim, not a claim that each individual primitive is novel.

## 3. Final security correction

The previous specification's narrow commitment field list was unsafe because it could silently ignore supplied transaction properties. The final specification fixes this:

> **Unknown transaction properties are rejected. Known but unsupported transaction classes/fields are rejected as `UNSUPPORTED`. Every supported supplied field is included in the canonical request domain.**

Wallet-populated fields can be absent from the DApp request and therefore absent from the request commitment. That is different from silently ignoring a field that the DApp actually supplied.

## 4. Final canonicalization domain

For MVP, supported transaction classes are the request forms needed for the demo and ordinary legacy/EIP-2930/EIP-1559 flows.

The canonical schema includes, when present and supported:

- `from`
- `to` (required for MVP; contract creation unsupported)
- `value` (omitted = semantic zero)
- `data` (omitted = `0x`)
- `chainId` (explicit value must agree with the provider's current chain; omitted value is resolved from that trusted provider context)
- `nonce`
- `gas`
- `gasPrice`
- `maxFeePerGas`
- `maxPriorityFeePerGas`
- `accessList`
- transaction `type`

The following are **known but unsupported** in MVP:

- `maxFeePerBlobGas`
- `blobVersionedHashes`
- `authorizationList`
- transaction types outside the supported legacy/type-1/type-2 set

Unknown keys are rejected.

## 5. Canonicalization rules

1. Validate the request against the supported schema.
2. Reject unknown keys.
3. Reject unsupported transaction classes/fields.
4. Normalize addresses to lowercase 20-byte hex.
5. Normalize quantities to canonical Ethereum quantity form (`0x0` for zero; no leading zeroes).
6. Normalize calldata as lowercase, even-length byte hex.
7. Normalize access-list addresses/storage keys and deterministically sort entries.
8. Normalize optional fields as `null`/omitted according to the fixed schema; do not collapse semantically distinct fee/type fields.
9. Resolve omitted `chainId` from the current provider chain context and include the resolved chain in the canonical representation.
10. Serialize the fixed schema using a deterministic serializer.
11. Hash the resulting UTF-8 canonical bytes with Keccak-256.

A domain/version prefix MUST be included in the commitment serialization, e.g. `actionproof.request.v1`, so a future schema cannot accidentally collide with this one.

## 6. What the commitment proves

It proves only:

> The request being forwarded is identical under the ActionProof canonical request domain to the request that was verified.

It does not prove:

- final signed bytes;
- wallet behavior after the provider boundary;
- DApp integrity;
- contract safety;
- economic safety;
- simulation/execution equivalence after state changes;
- RPC honesty.

## 7. Final decision

**BUILD.** The research stop condition is satisfied. Future improvements are intentionally deferred rather than silently included in the MVP.

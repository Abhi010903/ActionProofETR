# ActionProof — Final Architecture

## 1. Security boundary

The provider proxy is the enforcement boundary. The guarantee applies only when the DApp cannot reach the wallet through an alternate provider path.

EIP-1193 explicitly treats the Provider as an adversarial JavaScript object whose properties may be read or overwritten. Therefore a generic wrapper cannot claim protection against provider bypass unless it is installed/controlled before the DApp obtains an alternative provider.

## 2. End-to-end flow

```text
DApp
  │
  │ EIP-1193 request
  ▼
ActionProof Provider Proxy
  │
  ├─ validate method + params
  ├─ deep snapshot
  ├─ strict canonicalization
  ├─ versioned Keccak commitment
  │
  ▼
Evidence Pipeline
  ├─ independent ABI decode
  ├─ recursive supported multicall decode
  ├─ contract/source evidence
  ├─ ERC-7730 v2 descriptor evidence
  ├─ simulation + block/state context
  └─ optional frontend provenance
  │
  ▼
Deterministic Comparison
  │
  ▼
Deterministic Policy
  │
  ├─ BLOCKED / UNSUPPORTED → stop
  │
  ▼
Pre-forward recheck
  │
  ├─ commitment mismatch → BLOCKED
  │
  ▼
Wallet Provider
```

## 3. Identity layers

### Level 1 — Semantic transaction identity

Describes the execution request: sender, destination, value, calldata, network and relevant supplied transaction parameters.

### Level 2 — Transaction-request binding — MVP

The request verified by ActionProof matches the request ActionProof forwards, under the defined canonical schema.

### Level 3 — Final signing-payload binding — not MVP

The exact typed/RLP serialized transaction signed by the wallet. This requires a wallet-native signing boundary or equivalent control.

## 4. Canonical request domain

Supported MVP transaction classes:

- legacy/type-0 request form;
- EIP-2930/type-1 request form;
- EIP-1559/type-2 request form.

Supported fields, when valid for the selected class:

```text
from
to
value
data
chainId
nonce
gas
gasPrice
maxFeePerGas
maxPriorityFeePerGas
accessList
type
```

Rules:

- `to` is required in MVP; contract creation is unsupported.
- omitted `value` canonicalizes to zero.
- omitted `data` canonicalizes to `0x`.
- omitted `chainId` is resolved from the current trusted provider chain context; if supplied, it must agree with that context.
- supplied fee/nonce fields are bound rather than silently ignored.
- unknown fields are rejected.
- blob and EIP-7702 authorization fields are unsupported.

## 5. Canonical serialization

Use a fixed versioned schema and deterministic serializer. The commitment domain must include a constant such as:

```text
"actionproof.request.v1"
```

Then serialize the fixed canonical structure and hash its UTF-8 bytes with Ethereum-compatible Keccak-256.

Do not rely on incidental JavaScript property ordering as the security specification.

## 6. Components

```text
provider-proxy
transaction-core
transaction-decoder
contract-verification
intent-erc7730
simulation
comparison
policy
evidence
integrity (optional)
```

## 7. External evidence boundaries

No external component is authoritative on its own.

```text
Sourcify       → source/bytecode correspondence evidence
ERC-7730       → structured semantic evidence
Registry       → descriptor distribution evidence
Simulation     → state-specific execution evidence
DappFence      → frontend provenance evidence
WEBCAT         → frontend integrity prior art
LLM            → explanation only
```

## 8. Unsupported modern write paths

The proxy MUST NOT pretend to secure:

- `wallet_sendCalls` / EIP-5792;
- EIP-7702 type-4 transactions;
- ERC-4337 UserOperations;
- generic EIP-712 signatures;
- Permit/Permit2;
- blob transaction execution.

These paths should be visible as explicit unsupported coverage rather than silently passing through as verified transactions.

## 9. Provider bypass

A DApp that obtains another provider reference can bypass a wrapper. Full protection requires earlier interception or wallet/browser integration. The hackathon MVP uses a controlled demo DApp where ActionProof is the only wallet path.

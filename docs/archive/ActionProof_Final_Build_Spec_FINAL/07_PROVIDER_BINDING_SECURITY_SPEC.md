# ActionProof — Provider Binding Security Specification

## 1. Security claim

### MVP claim

Within an integration where ActionProof owns the only DApp-to-wallet EIP-1193 provider path, ActionProof can establish that the supported transaction request it verified is the supported transaction request it forwards, under the canonical request domain defined here.

### Explicit non-claim

ActionProof does not control the final signed transaction bytes produced by an arbitrary wallet. Wallets may populate or transform transaction fields after receiving the provider request.

## 2. Security levels

```text
L1 — semantic transaction identity
L2 — canonical transaction-request binding  ← MVP
L3 — final signed-payload binding            ← NOT MVP
```

## 3. Threat model

Attacker may:

- mutate the live transaction while verification is running;
- replace destination, value, calldata, chain context or supplied fee/nonce fields;
- replace the transaction object;
- hide dangerous operations in supported multicall wrappers;
- attempt to use another provider reference.

Provider bypass is out of the controlled boundary unless ActionProof is installed before the DApp can access another provider.

## 4. Canonical request domain

### Supported classes

- legacy/type-0;
- EIP-2930/type-1;
- EIP-1559/type-2.

### Supported fields

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

The implementation MUST validate which fields are legal for the selected type.

### Unsupported known fields/classes

```text
maxFeePerBlobGas
blobVersionedHashes
authorizationList
blob/type-3 transaction forms
type-4/EIP-7702 forms
contract-creation requests
```

### Unknown fields

Reject. Never silently ignore.

## 5. Canonicalization

1. Validate object shape.
2. Validate transaction type.
3. Validate field compatibility.
4. Validate `from` and `to` as 20-byte addresses.
5. Normalize addresses lowercase.
6. Normalize quantities to Ethereum quantity form.
7. Normalize data to lowercase even-length bytes.
8. Normalize access list and sort deterministically.
9. Resolve omitted `chainId` from the current provider chain context.
10. If supplied `chainId` differs from current provider chain, reject/block.
11. Build the fixed canonical schema.
12. Include domain/version identifier `actionproof.request.v1`.
13. Serialize deterministically.
14. Keccak-256 the canonical bytes.

The serializer must be a deliberate deterministic serializer; JavaScript insertion order is not the security specification.

## 6. Semantic equivalence

The following may canonicalize equally where the RPC semantics are equivalent:

- omitted `value` and `value = 0x0`;
- uppercase vs lowercase hex addresses;
- quantity representations that are accepted as equivalent by the adapter before canonicalization.

Invalid Ethereum quantity encodings must be rejected rather than normalized into validity.

## 7. State machine

```text
RECEIVED
  ↓
VALIDATED
  ↓
SNAPSHOT_CREATED
  ↓
CANONICALIZED
  ↓
COMMITMENT_CREATED
  ↓
VERIFICATION_RUNNING
  ↓
VERIFICATION_COMPLETE
  ↓
POLICY_CHECK
  ↓
PRE_FORWARD_RECHECK
  ├─ mismatch → BLOCKED
  ├─ unsupported → UNSUPPORTED
  └─ match → FORWARD
```

## 8. Reference algorithm

```text
on eth_sendTransaction(request):
    validate_supported_request(request)
    snapshot = immutable_deep_copy(request.tx)

    verified = canonicalize_and_commit(snapshot, provider_chain_context)

    evidence = verify(snapshot)
    verdict = deterministic_policy(evidence)

    if verdict in {BLOCKED, UNSUPPORTED}:
        stop

    live = request.tx_about_to_be_forwarded
    current = canonicalize_and_commit(live, provider_chain_context)

    if current.commitment != verified.commitment:
        BLOCKED
        do_not_call_wallet

    call_wallet_with(live)
```

## 9. Critical TOCTOU requirement

Test 7 must force this exact ordering:

```text
capture A
↓
commit A
↓
verification barrier reached
↓
release verification
↓
mutate live object to B
↓
pre-forward recheck
↓
commitment mismatch
↓
BLOCK
```

No sleep, timeout or race is acceptable as the proof.

## 10. Tests

### Test 1 — normal

A is verified and forwarded. Wallet receives A.

### Test 2 — calldata mutation

A.data → B.data after verification. Expected `BLOCKED`; wallet receives nothing.

### Test 3 — destination mutation

A.to → attacker. Expected `BLOCKED`.

### Test 4 — value mutation

A.value changes. Expected `BLOCKED`.

### Test 5 — chain mutation

A.chainId/context changes. Expected `BLOCKED`.

### Test 6 — canonical equivalence

Equivalent accepted encodings produce equal commitments.

### Test 7 — deterministic post-verification mutation

Barrier-controlled mutation after verification and before recheck. Expected `BLOCKED`.

### Test 8 — unknown field

Inject an unknown transaction property. Expected rejection/`UNSUPPORTED`; never `VERIFIED`.

### Test 9 — supplied gas mutation

If gas was part of the request, change it after verification. Expected `BLOCKED`.

### Test 10 — transaction type mutation

Change supported transaction type after verification. Expected `BLOCKED`.

### Test 11 — EIP-7702 authorization list

Request containing `authorizationList`. Expected `UNSUPPORTED`; wallet receives nothing.

### Test 12 — EIP-5792 write path

`wallet_sendCalls` is not handled as `eth_sendTransaction`. Expected `UNSUPPORTED` in the ActionProof MVP interface.

## 11. Acceptance criteria

Phase 1 is complete only when:

- all tests are deterministic;
- production hashing uses Keccak-256;
- verification uses immutable snapshots;
- unknown fields never pass silently;
- blocked requests never reach the wallet;
- the final recheck is immediately before forwarding;
- the exact wallet-bound request is the object whose commitment was rechecked.

## 12. Bypass limitation

If the DApp bypasses the proxy, this security claim no longer applies. A browser extension, wallet-native integration or earlier interception point would be required for broader DApp coverage.

## 13. Wallet limitation

The provider boundary ends when ActionProof calls the wallet provider. The wallet may subsequently populate nonce, fees, gas or other final signing fields. ActionProof therefore does not claim final signed-payload binding.

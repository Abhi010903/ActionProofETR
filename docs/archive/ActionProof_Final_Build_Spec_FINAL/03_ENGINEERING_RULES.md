# ActionProof — Engineering Rules

## 1. Security rules

1. The coding agent implements the frozen specification; it does not silently redesign it.
2. Never forward a supported `eth_sendTransaction` without a pre-forward commitment recheck.
3. Verification always uses an immutable snapshot.
4. The request passed to the wallet is the request whose commitment was rechecked.
5. Any mismatch is `BLOCKED`.
6. Unknown transaction properties are rejected.
7. Known but unsupported transaction classes/fields produce `UNSUPPORTED` and are not forwarded.
8. Never describe Level-2 request binding as Level-3 final signed-payload binding.
9. Never claim global transaction safety from a matching commitment.
10. Never allow an LLM to decide the security verdict.

## 2. Canonicalization rules

- addresses: validate 20-byte hex, normalize lowercase;
- quantities: canonical Ethereum quantity (`0x0` for zero, no leading zeroes);
- data: valid even-length byte hex, normalize lowercase;
- access list: validate entries, normalize addresses/keys, deterministic ordering;
- chain context: compare supplied chain ID to the provider's current chain and include the resolved chain ID in the canonical representation;
- fixed field schema: no arbitrary object-key ordering dependence;
- commitment domain: versioned (`actionproof.request.v1`).

## 3. Cryptography

Production commitments MUST use Ethereum Keccak-256 through a maintained Ethereum library such as viem. The dependency-free reference PoC may use SHA-256 only to demonstrate control flow; it is not production cryptography.

Source for viem license: https://github.com/wevm/viem

## 4. Provider rules

The proxy must own the wallet path for the controlled integration. It must forward only after the final synchronous commitment comparison. No external callback, await, or mutation opportunity may exist between the successful equality check and construction of the wallet request.

## 5. External inputs

Validate schemas for all external responses. Treat RPC, registry, source-verification and simulation results as untrusted evidence.

Any backend URL fetcher must enforce SSRF protections.

## 6. Testing rules

Security tests must be deterministic. Do not use arbitrary sleeps, timing races, or `setTimeout` as the proof of a security invariant.

Minimum suite:

1. normal request forwards;
2. calldata mutation blocks;
3. destination mutation blocks;
4. value mutation blocks;
5. chain mutation blocks;
6. canonical-equivalent representations match;
7. post-verification mutation through an explicit barrier blocks;
8. unknown-field injection is rejected/unsupported;
9. supplied gas mutation blocks;
10. transaction-type mutation blocks;
11. EIP-7702 authorization-list request is unsupported;
12. `wallet_sendCalls` is unsupported by the MVP path;
13. blocked requests never reach the mock wallet.

## 7. Reuse rules

Verify exact version/commit and license before source reuse. Preserve notices. No Veryclear source reuse without a newly verified compatible license.

## 8. Scope discipline

Do not opportunistically add ERC-4337, EIP-712, Permit2, EIP-5792, EIP-7702, browser-extension interception, hardware wallets, or L2 guarantees to Phase 1.

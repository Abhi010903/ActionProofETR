# ActionProof — Problem Definition: The Pre-Signing Vulnerability Gap

## 1. Executive Summary

In the current Web3 transaction paradigm, Ethereum users face an acute security vulnerability: **they are forced to make irreversible financial authorization decisions using blind, untrusted, or easily manipulated information.**

Every year, hundreds of millions of dollars in digital assets are stolen through:
1. **Compromised Frontend UI Claims:** Frontends displaying *"Swap 100 USDC for ETH"* while silently crafting malicious calldata that drains tokens.
2. **Stealth Multicall Injections:** Legitimate operations bundled with unannounced token drainers (e.g. `approve(attacker, type(uint256).max)`) inside batch contracts.
3. **In-Memory Post-Verification Tampering (TOCTOU):** Malicious browser extensions or hostile scripts modifying in-flight JavaScript transaction request objects between verification and wallet dispatch.
4. **Opaque Calldata & Unintelligible Signatures:** Hexadecimal payloads that users and basic wallets cannot independently interpret or verify.

---

## 2. The Mechanics of Current Failure Modes

### Failure Mode 1: Untrusted DApp Interface Assertions
When a user interacts with a decentralized application, the text displayed on the screen (*"Claim Airdrop"*, *"Swap Tokens"*, *"Stake Assets"*) is merely arbitrary HTML/DOM rendered by a web server. 
- The user has **zero cryptographic guarantee** that the rendered UI claim matches the hexadecimal calldata passed to `eth_sendTransaction`.
- If the DApp's DNS, hosting provider, CDN, or dependency tree is compromised (e.g. supply-chain attacks on `@web3-react` or wallet-connect libraries), the attacker can display benign actions while dispatching account-draining transactions.

### Failure Mode 2: The Inadequacy of Wallet Confirmation Screens
Wallets (such as MetaMask, Rabby, or Coinbase Wallet) receive transaction requests over EIP-1193. However, wallet confirmation dialogs frequently fail to protect users because:
- **Calldata Opacity:** Unless a contract is verified on a public block explorer and has an ABI that the wallet recognizes, the wallet presents raw unformatted hex bytes.
- **Multicall Obfuscation:** Wallets often display the top-level contract (`Multicall3` or `SwapRouter02`) and method name (`multicall(...)`), hiding nested subcalls that approve attacker addresses.
- **Confirmation Fatigue:** Users are trained to click "Confirm" repeatedly. Without structured, deterministic verification, users have no actionable security signals.

### Failure Mode 3: In-Memory Request Mutation (TOCTOU)
In the browser runtime, transaction parameters are passed as mutable JavaScript objects across asynchronous event loops:
```javascript
// DApp creates request
const tx = { to: uniswapRouter, data: swapData, value: "0x0" };

// Any script in the DOM or extension can mutate the object by reference
window.ethereum.request({ method: "eth_sendTransaction", params: [tx] });
```
If a client-side security scanner analyzes `tx`, approves it, and then dispatches it, an adversarial script or browser extension can alter `tx.to` to an attacker's address immediately before the wallet receives the call. The wallet receives and presents the tampered request, completely bypassing the scanner.

### Failure Mode 4: Modern Write Path Bypass
Modern Ethereum evolution introduces alternative transaction and write paths:
- **EIP-7702 (Type-4 Transactions):** Allows Externally Owned Accounts (EOAs) to temporarily delegate code execution to smart contracts via an `authorizationList`.
- **EIP-5792 (`wallet_sendCalls`):** Bypasses standard `eth_sendTransaction` semantics with batched wallet calls.
- **ERC-4337 (`UserOperation`):** Bypasses mempools through alternative bundlers.

If a security tool blindly forwards these alternative write paths without understanding or validating their schemas, malicious payloads slip past pre-signing gates.

---

## 3. The Need for ActionProof

Securing Web3 transactions requires moving beyond passive warnings and unverified UI claims. It requires an authoritative, **in-line pre-signing enforcement gate** that:
1. Intercepts transaction requests at the provider boundary before the wallet can be prompted.
2. Freezes an immutable snapshot of the request to prevent in-flight tampering.
3. Canonically binds the exact parameters verified to the exact parameters forwarded.
4. Recursively unpacks complex multicall batches to identify hidden approvals.
5. Fails closed when calldata cannot be independently decoded or when unsupported protocol features are detected.

# ActionProof — Third-Party / Dependency Notices

This repository strictly records all third-party software incorporated or referenced, in compliance with project reuse and legal rules.

## Incorporated Production / Development Dependencies

| Package | Repository | License | Version | Purpose in ActionProof |
|---|---|---|---|---|
| **viem** | [https://github.com/wevm/viem](https://github.com/wevm/viem) | MIT | `^2.56.8` | Ethereum-compatible Keccak-256 (`keccak256`), hex byte conversion, standard ABI decoding (`decodeFunctionData`), ABI encoding in test fixtures. |
| **vitest** | [https://github.com/vitest-dev/vitest](https://github.com/vitest-dev/vitest) | MIT | `^2.1.9` | Test framework for deterministic provider-binding, canonicalization, decoder, and policy test suites. |
| **typescript** | [https://github.com/microsoft/TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | `^5.7.2` | Strict compile-time static type system and interface enforcement. |
| **react** | [https://github.com/facebook/react](https://github.com/facebook/react) | MIT | `^19.3.0` | UI component library for the interactive security console and attack lab. |
| **react-dom** | [https://github.com/facebook/react](https://github.com/facebook/react) | MIT | `^19.3.0` | DOM renderer for React security console. |
| **vite** | [https://github.com/vitejs/vite](https://github.com/vitejs/vite) | MIT | `^5.4.21` | Frontend development server and production bundler. |
| **@vitejs/plugin-react** | [https://github.com/vitejs/vite-plugin-react](https://github.com/vitejs/vite-plugin-react) | MIT | `^4.7.0` | React JSX fast refresh plugin for Vite. |
| **@types/node** | [https://github.com/DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT | `^26.6.2` | TypeScript type definitions for Node.js runtime. |

---

## Standards and Ecosystem Specifications Referenced

| Specification | Document URI | Status | Role in ActionProof |
|---|---|---|---|
| **EIP-1193** | [https://eips.ethereum.org/EIPS/eip-1193](https://eips.ethereum.org/EIPS/eip-1193) | Final | Provider JavaScript API; defines adversarial provider model and security boundary. |
| **EIP-1474** | [https://eips.ethereum.org/EIPS/eip-1474](https://eips.ethereum.org/EIPS/eip-1474) | Draft | RPC transaction request field schema (`eth_sendTransaction`). |
| **EIP-2718** | [https://eips.ethereum.org/EIPS/eip-2718](https://eips.ethereum.org/EIPS/eip-2718) | Final | Typed transaction envelope specification (Type 0, Type 1, Type 2). |
| **EIP-1559** | [https://eips.ethereum.org/EIPS/eip-1559](https://eips.ethereum.org/EIPS/eip-1559) | Final | Fee market change for ETH 1.0 (Type-2 transaction fields). |
| **ERC-7730** | [https://eips.ethereum.org/EIPS/eip-7730](https://eips.ethereum.org/EIPS/eip-7730) | Draft (v2.0.0) | Clear-Signing format for wallets; advisory semantic evidence adapter. |
| **EIP-7702** | [https://eips.ethereum.org/EIPS/eip-7702](https://eips.ethereum.org/EIPS/eip-7702) | Final | Set EOA account code; outside MVP scope (fails closed as `UNSUPPORTED`). |
| **EIP-5792** | [https://eips.ethereum.org/EIPS/eip-5792](https://eips.ethereum.org/EIPS/eip-5792) | Final | `wallet_sendCalls` wallet call bundle RPC; outside MVP scope (`UNSUPPORTED`). |
| **ERC-4337** | [https://eips.ethereum.org/EIPS/eip-4337](https://eips.ethereum.org/EIPS/eip-4337) | Final | Account Abstraction using alt mempool / UserOperations; outside MVP scope. |
| **EIP-712** | [https://eips.ethereum.org/EIPS/eip-712](https://eips.ethereum.org/EIPS/eip-712) | Final | Typed structured data hashing and signing; outside MVP scope. |

---

## Prior Art Researched (No Source Reuse)

- **Veryclear** ([https://github.com/lfglabs-dev/explain.md](https://github.com/lfglabs-dev/explain.md)): Studied for architecture and trust modeling only. No public license identified in the reviewed repository; strictly **no source code copied or reused**.
- **ERC-7730 Analyzer** ([https://github.com/LedgerHQ/erc7730-analyzer](https://github.com/LedgerHQ/erc7730-analyzer)): Studied as prior art for descriptor auditing. ActionProof rejects its LLM-based verdict approach in favor of pure deterministic policy.
- **Sourcify** ([https://github.com/argotorg/sourcify](https://github.com/argotorg/sourcify)): Used as external contract source/bytecode correspondence verification adapter.
- **Temper** ([https://github.com/EnsoFinance/temper](https://github.com/EnsoFinance/temper)): EVM simulation reference for state-specific execution evidence.
- **DappFence** ([https://github.com/coinspect/dappfence](https://github.com/coinspect/dappfence)): Researched for frontend integrity service-worker model.

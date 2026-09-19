/**
 * ActionProof EIP-1193 Provider Interfaces & Mock Wallet
 *
 * WHAT it guarantees:
 * - Adheres strictly to EIP-1193 standard `request({ method, params })` interface.
 * - Tracks forwarded requests to prove whether any blocked request reached the wallet.
 *
 * WHAT it does NOT guarantee:
 * - Does not prevent a DApp from bypassing the proxy if the DApp retains an alternate provider reference.
 */

export interface RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | object;
}

export interface EIP1193Provider {
  request(args: RequestArguments): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export class MockWalletProvider implements EIP1193Provider {
  public received: Record<string, unknown>[] = [];
  public chainId: number = 1;
  public accounts: `0x${string}`[] = ['0x04f8996da763b7a969b1028ee3007569eaf3a635'];

  constructor(initialChainId = 1) {
    this.chainId = initialChainId;
  }

  async request(args: RequestArguments): Promise<unknown> {
    const { method, params } = args;

    if (method === 'eth_chainId') {
      return '0x' + this.chainId.toString(16);
    }

    if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
      return [...this.accounts];
    }

    if (method === 'eth_sendTransaction') {
      if (!params || !Array.isArray(params) || params.length === 0) {
        throw new Error('RPC_INVALID_PARAMS: eth_sendTransaction expects array with transaction object');
      }
      // Record a deep copy of the exact received request payload
      const tx = JSON.parse(JSON.stringify(params[0]));
      this.received.push(tx);
      return ('0xmock_tx_' + this.received.length + '_' + Date.now().toString(16)) as `0x${string}`;
    }

    if (method === 'wallet_sendCalls') {
      throw new Error('EIP-5792 wallet_sendCalls not implemented in mock wallet');
    }

    return null;
  }

  reset(): void {
    this.received = [];
  }
}

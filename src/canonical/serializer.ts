/**
 * ActionProof Deterministic Serializer
 *
 * WHAT it guarantees:
 * - Deterministic serialization of the canonical transaction request.
 * - Enforces fixed schema ordering independent of JavaScript runtime object key order.
 * - Generates consistent UTF-8 byte representation for cryptographic hashing.
 *
 * WHAT it does NOT guarantee:
 * - Does not produce RLP-encoded wire transactions (not Level-3).
 */

import type { CanonicalTransactionRequest } from './types.js';

export function serializeCanonicalRequest(canonical: CanonicalTransactionRequest): string {
  // Deterministic, fixed-order serialization
  return JSON.stringify({
    domain: canonical.domain,
    type: canonical.type,
    from: canonical.from,
    to: canonical.to,
    value: canonical.value,
    data: canonical.data,
    chainId: canonical.chainId,
    nonce: canonical.nonce,
    gas: canonical.gas,
    gasPrice: canonical.gasPrice,
    maxFeePerGas: canonical.maxFeePerGas,
    maxPriorityFeePerGas: canonical.maxPriorityFeePerGas,
    accessList: canonical.accessList.map(entry => ({
      address: entry.address,
      storageKeys: [...entry.storageKeys],
    })),
  });
}

/**
 * ActionProof Canonicalization and Keccak-256 Commitment
 *
 * WHAT it guarantees:
 * - Deterministic transformation from EIP-1193 transaction request to canonical representation.
 * - Versioned Keccak-256 commitment over the canonical request domain (`actionproof.request.v1`).
 * - Immediate detection of any field modification, insertion, or deletion.
 *
 * WHAT it does NOT guarantee:
 * - Does not guarantee final signed RLP payload bytes (Level-3 property).
 * - Does not guarantee wallet behavior once the request is forwarded across the boundary.
 */

import { keccak256, stringToBytes } from 'viem';
import { validateRequestShape, validateTypeCompatibility } from './schema.js';
import {
  normalizeAddress,
  normalizeQuantity,
  normalizeOptionalQuantity,
  normalizeData,
  normalizeAccessList,
  normalizeChainId,
  normalizeTransactionType,
} from './normalize.js';
import { serializeCanonicalRequest } from './serializer.js';
import type { CanonicalTransactionRequest, RequestCommitment } from './types.js';

export function canonicalize(tx: unknown, activeChainId = 1): CanonicalTransactionRequest {
  const record = validateRequestShape(tx);

  const type = normalizeTransactionType(record.type);
  validateTypeCompatibility(type, record);

  const from = normalizeAddress(record.from);
  const to = normalizeAddress(record.to);
  const value = normalizeQuantity(record.value);
  const data = normalizeData(record.data);
  const chainId = normalizeChainId(record.chainId, activeChainId);

  const nonce = normalizeOptionalQuantity(record.nonce);
  const gas = normalizeOptionalQuantity(record.gas);
  const gasPrice = normalizeOptionalQuantity(record.gasPrice);
  const maxFeePerGas = normalizeOptionalQuantity(record.maxFeePerGas);
  const maxPriorityFeePerGas = normalizeOptionalQuantity(record.maxPriorityFeePerGas);
  const accessList = normalizeAccessList(record.accessList);

  const canonical: CanonicalTransactionRequest = Object.freeze({
    domain: 'actionproof.request.v1',
    type,
    from,
    to,
    value,
    data,
    chainId,
    nonce,
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
    accessList: Object.freeze(accessList.map(entry => Object.freeze({
      address: entry.address,
      storageKeys: Object.freeze([...entry.storageKeys]),
    }))),
  });

  return canonical;
}

export function computeCommitment(tx: unknown, activeChainId = 1): RequestCommitment {
  const canonical = canonicalize(tx, activeChainId);
  const serialized = serializeCanonicalRequest(canonical);
  const hash = keccak256(stringToBytes(serialized));

  return {
    canonical,
    serialized,
    hash,
  };
}

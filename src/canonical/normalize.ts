/**
 * ActionProof Field Normalizers
 *
 * WHAT it guarantees:
 * - Deterministic representation of addresses, quantities, calldata, and access lists.
 * - Semantic equivalence mapping (e.g. 0x00 -> 0x0, uppercase -> lowercase).
 * - Chain ID validation against active provider context.
 *
 * WHAT it does NOT guarantee:
 * - Does not verify address ownership or contract bytecode validity.
 */

import { SchemaValidationError } from './schema.js';
import type { AccessListEntry, SupportedTransactionType } from './types.js';

export function normalizeAddress(v: unknown): `0x${string}` {
  if (typeof v !== 'string' || !/^0[xX][0-9a-fA-F]{40}$/.test(v)) {
    throw new SchemaValidationError('INVALID_ADDRESS', `Invalid 20-byte hex address: ${String(v)}`);
  }
  return ('0x' + v.slice(2).toLowerCase()) as `0x${string}`;
}

export function normalizeQuantity(v: unknown): `0x${string}` {
  if (v === undefined || v === null) {
    return '0x0';
  }

  let hexStr: string;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new SchemaValidationError('INVALID_QUANTITY', `Quantity number must be a non-negative safe integer: ${v}`);
    }
    hexStr = '0x' + BigInt(v).toString(16);
  } else if (typeof v === 'bigint') {
    if (v < 0n) {
      throw new SchemaValidationError('INVALID_QUANTITY', `Quantity bigint must be non-negative: ${v.toString()}`);
    }
    hexStr = '0x' + v.toString(16);
  } else if (typeof v === 'string') {
    if (!/^0[xX][0-9a-fA-F]+$/.test(v)) {
      throw new SchemaValidationError('INVALID_QUANTITY', `Invalid hex quantity string: ${v}`);
    }
    try {
      const parsed = BigInt(v);
      hexStr = '0x' + parsed.toString(16);
    } catch {
      throw new SchemaValidationError('INVALID_QUANTITY', `Cannot parse hex quantity: ${v}`);
    }
  } else {
    throw new SchemaValidationError('INVALID_QUANTITY', `Invalid quantity type: ${typeof v}`);
  }

  return hexStr as `0x${string}`;
}

export function normalizeOptionalQuantity(v: unknown): `0x${string}` | null {
  if (v === undefined || v === null) {
    return null;
  }
  return normalizeQuantity(v);
}

export function normalizeData(v: unknown): `0x${string}` {
  if (v === undefined || v === null || v === '') {
    return '0x';
  }
  if (typeof v !== 'string' || !/^0[xX]([0-9a-fA-F]{2})*$/.test(v)) {
    throw new SchemaValidationError('INVALID_DATA', `Invalid hex byte data: ${String(v)}`);
  }
  return ('0x' + v.slice(2).toLowerCase()) as `0x${string}`;
}

export function normalizeAccessList(v: unknown): AccessListEntry[] {
  if (v === undefined || v === null) {
    return [];
  }
  if (!Array.isArray(v)) {
    throw new SchemaValidationError('INVALID_ACCESS_LIST', 'Access list must be an array');
  }

  return v.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new SchemaValidationError('INVALID_ACCESS_LIST_ENTRY', `Invalid access list entry at index ${idx}`);
    }
    const item = entry as { address?: unknown; storageKeys?: unknown };
    const address = normalizeAddress(item.address);
    const rawKeys = item.storageKeys;
    if (rawKeys !== undefined && rawKeys !== null && !Array.isArray(rawKeys)) {
      throw new SchemaValidationError('INVALID_STORAGE_KEYS', `storageKeys at index ${idx} must be an array`);
    }
    const storageKeys = (Array.isArray(rawKeys) ? rawKeys : []).map((k: unknown, kIdx: number) => {
      if (typeof k !== 'string' || !/^0[xX][0-9a-fA-F]{64}$/.test(k)) {
        throw new SchemaValidationError('INVALID_STORAGE_KEY', `Invalid 32-byte storage key at index ${idx}[${kIdx}]: ${String(k)}`);
      }
      return ('0x' + k.slice(2).toLowerCase());
    }).sort((a: string, b: string) => a.localeCompare(b));

    return { address, storageKeys };
  }).sort((a, b) => a.address.localeCompare(b.address));
}

export function normalizeChainId(supplied: unknown, activeChainId: number): number {
  if (!Number.isSafeInteger(activeChainId) || activeChainId <= 0) {
    throw new SchemaValidationError('INVALID_ACTIVE_CHAIN', `Active chain ID must be a positive safe integer: ${activeChainId}`);
  }

  if (supplied === undefined || supplied === null) {
    return activeChainId;
  }

  let resolvedChain: number;
  if (typeof supplied === 'number') {
    resolvedChain = supplied;
  } else if (typeof supplied === 'bigint') {
    resolvedChain = Number(supplied);
  } else if (typeof supplied === 'string') {
    const q = normalizeQuantity(supplied);
    resolvedChain = Number(BigInt(q));
  } else {
    throw new SchemaValidationError('INVALID_CHAIN_ID', `Invalid chainId type: ${typeof supplied}`);
  }

  if (!Number.isSafeInteger(resolvedChain) || resolvedChain <= 0) {
    throw new SchemaValidationError('INVALID_CHAIN_ID', `Chain ID must be positive safe integer: ${resolvedChain}`);
  }

  if (resolvedChain !== activeChainId) {
    throw new SchemaValidationError('CHAIN_MISMATCH', `Supplied chainId ${resolvedChain} does not match active provider chain ${activeChainId}`);
  }

  return resolvedChain;
}

export function normalizeTransactionType(v: unknown): SupportedTransactionType {
  if (v === undefined || v === null) {
    return '0x0';
  }
  const q = normalizeQuantity(v);
  if (q !== '0x0' && q !== '0x1' && q !== '0x2') {
    throw new SchemaValidationError(`UNSUPPORTED_TX_TYPE:${q}`, `Unsupported transaction type: ${q}`);
  }
  return q as SupportedTransactionType;
}

/**
 * ActionProof Schema Validator
 *
 * WHAT it guarantees:
 * - Strict structural and property validation for transaction requests.
 * - Rejects any unknown property (preventing unanalyzed payload injection).
 * - Identifies and fails closed on known but unsupported fields (EIP-7702, blob txs).
 * - Enforces field-compatibility constraints per EIP-2718 / EIP-1559.
 *
 * WHAT it does NOT guarantee:
 * - Does not validate smart-contract semantic safety.
 */

export const SUPPORTED_KEYS = new Set([
  'from',
  'to',
  'value',
  'data',
  'chainId',
  'nonce',
  'gas',
  'gasPrice',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'accessList',
  'type',
]);

export const UNSUPPORTED_KEYS = new Set([
  'maxFeePerBlobGas',
  'blobVersionedHashes',
  'authorizationList',
]);

export class SchemaValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'SchemaValidationError';
  }
}

export function validateRequestShape(tx: unknown): Record<string, unknown> {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
    throw new SchemaValidationError('INVALID_TX', 'Transaction request must be a non-null object');
  }

  const record = tx as Record<string | symbol, unknown>;
  const keys = Reflect.ownKeys(record);

  for (const key of keys) {
    if (typeof key === 'symbol') {
      throw new SchemaValidationError(`UNKNOWN_FIELD:${key.toString()}`, `Unknown symbol transaction field: ${key.toString()}`);
    }
    if (UNSUPPORTED_KEYS.has(key)) {
      throw new SchemaValidationError(`UNSUPPORTED_FIELD:${key}`, `Unsupported transaction field: ${key}`);
    }
    if (!SUPPORTED_KEYS.has(key)) {
      throw new SchemaValidationError(`UNKNOWN_FIELD:${key}`, `Unknown transaction field: ${key}`);
    }
  }

  if (record.to === undefined || record.to === null) {
    throw new SchemaValidationError('UNSUPPORTED_CONTRACT_CREATION', 'Contract creation transactions are unsupported in MVP');
  }

  if (record.from === undefined || record.from === null) {
    throw new SchemaValidationError('MISSING_FROM', 'Transaction "from" address is required');
  }

  return record as Record<string, unknown>;
}

export function validateTypeCompatibility(
  type: string,
  record: Record<string, unknown>
): void {
  if (type === '0x0') {
    if (record.maxFeePerGas !== undefined && record.maxFeePerGas !== null) {
      throw new SchemaValidationError('TYPE_FIELD_INCOMPATIBLE', 'maxFeePerGas is not permitted in legacy (type 0) transactions');
    }
    if (record.maxPriorityFeePerGas !== undefined && record.maxPriorityFeePerGas !== null) {
      throw new SchemaValidationError('TYPE_FIELD_INCOMPATIBLE', 'maxPriorityFeePerGas is not permitted in legacy (type 0) transactions');
    }
    if (record.accessList !== undefined && record.accessList !== null) {
      throw new SchemaValidationError('TYPE_FIELD_INCOMPATIBLE', 'accessList is not permitted in legacy (type 0) transactions');
    }
  } else if (type === '0x1') {
    if (record.maxFeePerGas !== undefined && record.maxFeePerGas !== null) {
      throw new SchemaValidationError('TYPE_FIELD_INCOMPATIBLE', 'maxFeePerGas is not permitted in type 1 transactions');
    }
    if (record.maxPriorityFeePerGas !== undefined && record.maxPriorityFeePerGas !== null) {
      throw new SchemaValidationError('TYPE_FIELD_INCOMPATIBLE', 'maxPriorityFeePerGas is not permitted in type 1 transactions');
    }
  } else if (type === '0x2') {
    if (record.gasPrice !== undefined && record.gasPrice !== null) {
      if (
        (record.maxFeePerGas !== undefined && record.maxFeePerGas !== null) ||
        (record.maxPriorityFeePerGas !== undefined && record.maxPriorityFeePerGas !== null)
      ) {
        throw new SchemaValidationError('TYPE_FIELD_INCOMPATIBLE', 'gasPrice cannot be combined with EIP-1559 fee fields');
      }
    }
  } else {
    throw new SchemaValidationError(`UNSUPPORTED_TX_TYPE:${type}`, `Unsupported transaction type: ${type}`);
  }
}

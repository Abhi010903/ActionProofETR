/**
 * ActionProof Immutable Snapshot
 *
 * WHAT it guarantees:
 * - Deeply clones and recursively freezes the transaction request object.
 * - Prevents asynchronous mutations to the live JavaScript object from affecting ongoing verification.
 * - Evaluates getters/proxies into fixed static values during serialization/deserialization.
 *
 * WHAT it does NOT guarantee:
 * - Does not prevent the live object itself from being mutated by hostile DApp code after snapshot creation
 *   (which is precisely why the pre-forward recheck exists).
 */

export function createImmutableSnapshot<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  function cloneAndFreeze(item: unknown, seen = new WeakMap<object, unknown>()): unknown {
    if (item === null || typeof item !== 'object') {
      return item;
    }

    if (seen.has(item)) {
      throw new Error('CIRCULAR_REFERENCE: Circular reference detected in transaction request');
    }

    if (Array.isArray(item)) {
      const clonedArr: unknown[] = [];
      seen.set(item, clonedArr);
      for (let i = 0; i < item.length; i++) {
        clonedArr.push(cloneAndFreeze(item[i], seen));
      }
      return Object.freeze(clonedArr);
    }

    const clonedObj: Record<string | symbol, unknown> = {};
    seen.set(item, clonedObj);

    // Reflect.ownKeys captures string keys, non-enumerable keys, and symbol keys
    const keys = Reflect.ownKeys(item);
    for (const key of keys) {
      // Accessing item[key] invokes any getter into a concrete value once
      const val = (item as Record<string | symbol, unknown>)[key];
      clonedObj[key] = cloneAndFreeze(val, seen);
    }

    return Object.freeze(clonedObj);
  }

  return cloneAndFreeze(obj) as Readonly<T>;
}

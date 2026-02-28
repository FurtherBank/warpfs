import { LRUCache } from "lru-cache";

export interface CacheOptions {
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Maximum number of cached entries */
  max?: number;
}

/**
 * Creates a TTL-based cache wrapper around an async function.
 * Protects upstream APIs from high-frequency reads (e.g. Finder/Spotlight probing).
 */
export function createCachedFn<T>(
  fn: () => Promise<T>,
  options: CacheOptions,
): () => Promise<T> {
  const cache = new LRUCache<string, { value: T }>({
    max: options.max ?? 100,
    ttl: options.ttl,
  });

  const KEY = "__cached__";
  let inflight: Promise<T> | null = null;

  return async () => {
    const cached = cache.get(KEY);
    if (cached !== undefined) {
      return cached.value;
    }
    if (inflight) {
      return inflight;
    }
    inflight = fn().then((result) => {
      cache.set(KEY, { value: result });
      inflight = null;
      return result;
    });
    return inflight;
  };
}

/**
 * Decorator-style factory: wraps a class method with TTL caching.
 * Usage: apply via composition (TS experimental decorators not required).
 */
export function CacheTTL(ttlMs: number) {
  return function <T>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<() => Promise<T>>,
  ) {
    const original = descriptor.value!;
    const cache = new LRUCache<string, { value: T }>({ max: 1, ttl: ttlMs });

    descriptor.value = async function (this: unknown) {
      const cached = cache.get("v");
      if (cached !== undefined) return cached.value;
      const result = await original.call(this);
      cache.set("v", { value: result });
      return result;
    };

    return descriptor;
  };
}

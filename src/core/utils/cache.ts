import { config } from '../../config';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 60_000;

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const entry = memoryStore.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlMs = DEFAULT_TTL_MS,
): Promise<void> {
  if (config.REDIS_ENABLED) {
    // Redis wiring deferred — in-memory fallback per master prompt local dev path.
  }
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cacheDelete(key: string): Promise<void> {
  memoryStore.delete(key);
}

export async function cacheDeleteByPrefix(prefix: string): Promise<void> {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key);
    }
  }
}

export type CacheEntry<T> = {
  value: T;
  updatedAt: number;
  stale: boolean;
};

export const DEFAULT_FRESH_MS = 15_000;
export const CATALOG_FRESH_MS = 300_000;

const store = new Map<string, CacheEntry<unknown>>();

export function readClientCache<T>(
  key: string,
  freshMs = DEFAULT_FRESH_MS,
): { value: T; isFresh: boolean } | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  const isFresh = !entry.stale && Date.now() - entry.updatedAt < freshMs;
  return { value: entry.value as T, isFresh };
}

export function writeClientCache<T>(key: string, value: T): T {
  store.set(key, {
    value,
    updatedAt: Date.now(),
    stale: false,
  });
  return value;
}

export function invalidateClientCache(prefix?: string): void {
  for (const [key, entry] of store.entries()) {
    if (prefix === undefined || key.startsWith(prefix)) {
      entry.stale = true;
    }
  }
}

export function clearClientCache(prefix?: string): void {
  if (prefix === undefined) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

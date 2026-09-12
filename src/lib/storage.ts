/**
 * localStorage with the sharp edges filed off: quota errors, private-mode
 * throws, and corrupt values never take the app down.
 */
const PREFIX = 'ledgerly.';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing sensible to do */
  }
}

export function readString(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* nothing sensible to do */
  }
}

export const KEYS = {
  connection: 'connection',
  cacheTxns: 'cache.transactions',
  cacheConfig: 'cache.config',
  cacheMeta: 'cache.meta',
  queue: 'queue',
  theme: 'theme',
  mode: 'mode',
  filter: 'ui.filter',
  onboarded: 'ui.onboarded',
} as const;

/** Roughly 4 MB — below the usual 5 MB cap, with headroom for other keys. */
export const CACHE_BUDGET_BYTES = 4_000_000;

export function withinBudget(value: unknown): boolean {
  try {
    return JSON.stringify(value).length < CACHE_BUDGET_BYTES;
  } catch {
    return false;
  }
}

// localStorage with graceful failure (private mode, disabled storage).

// Kept as 'scrapyard.' after the BRAWLKAI rename so players' saved settings and profiles survive.
const PREFIX = 'scrapyard.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as T;
    if (typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)) {
      return { ...fallback, ...v };
    }
    return v;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}

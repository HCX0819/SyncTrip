// Per-instance only (serverless instances don't share memory), but enough to
// stop a single client from burning through a third-party API quota.
export function createRateLimiter(limit: number, windowMs: number) {
  const windows = new Map<string, { count: number; resets: number }>();
  return function isRateLimited(key: string) {
    const now = Date.now();
    const w = windows.get(key);
    if (!w || w.resets <= now) {
      windows.set(key, { count: 1, resets: now + windowMs });
      return false;
    }
    w.count += 1;
    return w.count > limit;
  };
}

// Small in-memory cache with a TTL and a size cap.
export class TtlCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500
  ) {}

  get(key: string): T | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T) {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      // Maps iterate in insertion order, so this evicts the oldest entry.
      this.entries.delete(this.entries.keys().next().value!);
    }
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

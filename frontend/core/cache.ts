export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const PREFIX = 'mapc-compat:';

export class TtlCache {
  constructor(
    private kv: KV,
    private now: () => number,
  ) {}

  get(key: string): string | null {
    try {
      const raw = this.kv.getItem(PREFIX + key);
      if (raw === null) return null;
      const e = JSON.parse(raw);
      if (typeof e?.exp !== 'number' || typeof e.v !== 'string' || e.exp <= this.now()) return null;
      return e.v;
    } catch {
      return null;
    }
  }

  set(key: string, value: string, ttlMs: number): void {
    try {
      this.kv.setItem(PREFIX + key, JSON.stringify({ exp: this.now() + ttlMs, v: value }));
    } catch {
      // storage full or unavailable: caching is best effort
    }
  }
}

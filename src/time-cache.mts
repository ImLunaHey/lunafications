export class TimeCache<T = string> {
  cache: Map<
    string,
    {
      value: T;
      time: number;
    }
  >;

  constructor(
    private ttl: number,
    private maxSize = 10_000,
  ) {
    this.cache = new Map();
  }

  private prune(now = Date.now()) {
    for (const [key, entry] of this.cache) {
      if (now - entry.time > this.ttl) this.cache.delete(key);
    }
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
  }

  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.time > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T) {
    this.cache.delete(key);
    this.prune();
    this.cache.set(key, { value, time: Date.now() });
  }


  get size() {
    return this.cache.size;
  }
}

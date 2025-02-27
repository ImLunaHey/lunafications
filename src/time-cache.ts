export class TimeCache {
  cache: Map<
    string,
    {
      value: string;
      time: number;
    }
  >;

  constructor(private ttl: number) {
    this.cache = new Map();
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

  set(key: string, value: string) {
    this.cache.set(key, { value, time: Date.now() });
  }
}

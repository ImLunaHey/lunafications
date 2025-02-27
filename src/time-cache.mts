export class TimeCache<T = string> {
  cache: Map<
    string,
    {
      value: T;
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

  set(key: string, value: T) {
    this.cache.set(key, { value, time: Date.now() });
  }
}

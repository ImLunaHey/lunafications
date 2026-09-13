import { describe, expect, test, vi } from 'vitest';
import { TimeCache } from './time-cache.mts';

describe('TimeCache', () => {
  test('expires entries after the TTL', () => {
    vi.useFakeTimers();
    const cache = new TimeCache<number>(100);
    cache.set('key', 1);
    vi.advanceTimersByTime(101);
    expect(cache.get('key')).toBeNull();
    expect(cache.size).toBe(0);
    vi.useRealTimers();
  });

  test('removes expired unrelated entries while writing', () => {
    vi.useFakeTimers();
    const cache = new TimeCache<number>(100);
    cache.set('old', 1);
    vi.advanceTimersByTime(101);
    cache.set('new', 2);
    expect(cache.size).toBe(1);
    expect(cache.get('new')).toBe(2);
    vi.useRealTimers();
  });

  test('never exceeds its configured size', () => {
    const cache = new TimeCache<number>(60_000, 2);
    cache.set('first', 1);
    cache.set('second', 2);
    cache.set('third', 3);
    expect(cache.size).toBe(2);
    expect(cache.get('first')).toBeNull();
  });
});

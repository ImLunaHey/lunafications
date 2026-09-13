import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getList } = vi.hoisted(() => ({ getList: vi.fn() }));
vi.mock('./common/agents.mts', () => ({
  publicAgent: { app: { bsky: { graph: { getList } } } },
}));

import { fetchListDetails, resolveDidToHandle, resolveHandleToDid } from './cache.mts';

beforeEach(() => {
  getList.mockReset();
  vi.unstubAllGlobals();
});

describe('identity and list lookups', () => {
  test('keys list cache entries by repository as well as rkey', async () => {
    getList.mockImplementation(async ({ list }: { list: string }) => ({ data: { list: { name: list } } }));
    const first = await fetchListDetails('did:plc:first', 'shared-rkey');
    const second = await fetchListDetails('did:plc:second', 'shared-rkey');
    expect(first.name).not.toBe(second.name);
    expect(getList).toHaveBeenCalledTimes(2);
  });

  test('normalizes handles and validates successful identity responses', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ did: 'did:plc:resolved' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveHandleToDid(' @Example.COM ')).toBe('did:plc:resolved');
    expect(fetchMock.mock.calls[0][0]).toContain('handle=example.com');
  });

  test('resolves did:web values through the profile service', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ handle: 'canonical.test' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveDidToHandle('did:web:alias.test')).toBe('canonical.test');
    expect(fetchMock.mock.calls[0][0]).toContain('actor=did%3Aweb%3Aalias.test');
  });

  test('returns null for failed identity requests', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect(await resolveHandleToDid('@missing.test')).toBeNull();
  });
});

import { ListView } from '@atproto/api/dist/client/types/app/bsky/graph/defs.js';
import { TimeCache } from './time-cache.mts';
import { publicAgent } from './common/agents.mts';
import { logger } from './logger.mts';

const ONE_MINUTE = 60_000;

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
};

const handleCache = new TimeCache(ONE_MINUTE);

/**
 * Resolves a DID to a handle.
 * @param did The DID to resolve.
 * @returns The handle of the DID.
 */
export const resolveDidToHandle = async (did: string): Promise<string> => {
  const cachedHandle = handleCache.get(did);
  if (cachedHandle) return cachedHandle;

  const data = (await fetchJson(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
  )) as { handle?: unknown };
  if (typeof data.handle !== 'string') throw new Error(`Identity response did not contain a handle for ${did}`);
  const handle = data.handle;

  handleCache.set(did, handle);

  return handle;
};

const listDetailsCache = new TimeCache<ListView>(ONE_MINUTE);

/**
 * Resolves a list ID to its name.
 * @param list The list ID.
 * @returns The name of the list.
 */
export const fetchListDetails = async (did: string, listId: string) => {
  const cacheKey = `${did}:${listId}`;
  const cacheList = listDetailsCache.get(cacheKey);
  if (cacheList) return cacheList;

  const list = await publicAgent.app.bsky.graph
    .getList({
      list: `at://${did}/app.bsky.graph.list/${listId}`,
    })
    .then((list) => list.data.list);
  listDetailsCache.set(cacheKey, list);
  return list;
};

const didCache = new TimeCache<string>(ONE_MINUTE);

/**
 * Resolves a handle to a DID.
 * @param actor The handle to resolve.
 * @returns The DID of the handle.
 */
export const resolveHandleToDid = async (_handle: string) => {
  try {
    const handle = _handle.trim().replace(/^@/, '').toLowerCase();
    const cachedDid = didCache.get(handle);
    if (cachedDid) return cachedDid;

    logger.info('Fetching profile', { handle });
    const data = (await fetchJson(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    )) as { did?: unknown };
    if (typeof data.did !== 'string' || !data.did.startsWith('did:')) return null;
    const did = data.did;
    didCache.set(handle, did);

    logger.info('Resolved handle', { handle, did });

    return did;
  } catch (error) {
    logger.error('Failed to resolve handle to DID:', error);
    return null;
  }
};

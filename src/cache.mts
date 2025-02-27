import { ListView } from '@atproto/api/dist/client/types/app/bsky/graph/defs.js';
import { TimeCache } from './time-cache.mts';
import { BskyAgent } from '@atproto/api';

const publicAgent = new BskyAgent({
  service: 'https://public.api.bsky.app',
});

const ONE_MINUTE = 60_000;

const handleCache = new TimeCache(ONE_MINUTE);

/**
 * Resolves a DID to a handle.
 * @param did The DID to resolve.
 * @returns The handle of the DID.
 */
export const resolveDidToHandle = async (did: string): Promise<string> => {
  const cachedHandle = handleCache.get(did);
  if (cachedHandle) return cachedHandle;

  const handle = await fetch(`https://plc.directory/${did}`)
    .then((res) => res.json())
    .then((data) => data.alsoKnownAs[0].split('at://')[1]);

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
  const cacheList = listDetailsCache.get(listId);
  if (cacheList) return cacheList;

  const list = await publicAgent.app.bsky.graph
    .getList({
      list: `at://${did}/app.bsky.graph.list/${listId}`,
    })
    .then((list) => list.data.list);
  listDetailsCache.set(listId, list);
  return list;
};

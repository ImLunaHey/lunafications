import { ListView } from '@atproto/api/dist/client/types/app/bsky/graph/defs.js';
import { TimeCache } from './time-cache.mts';
import { publicAgent, authedAgent } from './common/agents.mts';

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

  if (did.startsWith('did:web:')) {
    const handle = did.split('did:web:')[1];
    handleCache.set(did, handle);
    return handle;
  }

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

const didCache = new TimeCache<string>(ONE_MINUTE);

/**
 * Resolves a handle to a DID.
 * @param actor The handle to resolve.
 * @returns The DID of the handle.
 */
export const resolveHandleToDid = async (handle: string) => {
  const cachedDid = didCache.get(handle);
  if (cachedDid) return cachedDid;

  console.info(`Fetching profile for ${handle}`);
  const did = await authedAgent.com.atproto.identity.resolveHandle({ handle }).then((res) => res.data.did);
  didCache.set(handle, did);
  return did;
};

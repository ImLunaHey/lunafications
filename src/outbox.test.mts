import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./cache.mts', () => ({
  resolveDidToHandle: vi.fn(async () => 'actor.test'),
  fetchListDetails: vi.fn(),
}));

import { createDb, migrateToLatest, type Database } from './db/index.mts';
import { addMessage, getPendingMessages } from './outbox.mts';
import { processQueue } from './common/process-queue.mts';

describe('durable notification outbox', () => {
  let database: Database;

  beforeEach(async () => {
    database = createDb(':memory:');
    await migrateToLatest(database);
  });

  test('deduplicates the same event for the same recipient', async () => {
    const message = { type: 'blocked' as const, did: 'did:plc:actor' as const };
    await addMessage(database, 'did:plc:recipient', message, 100);
    await addMessage(database, 'did:plc:recipient', message, 200);
    expect(await getPendingMessages(database, 200)).toHaveLength(1);
  });

  test('keeps the same event separately for different recipients', async () => {
    const message = { type: 'post' as const, did: 'did:plc:actor' as const, post: 'post-1' };
    await addMessage(database, 'did:plc:first', message, 100);
    await addMessage(database, 'did:plc:second', message, 100);
    expect(await getPendingMessages(database, 100)).toHaveLength(2);
  });

  test('deletes a notification only after successful delivery', async () => {
    await addMessage(database, 'did:plc:recipient', { type: 'blocked', did: 'did:plc:actor' }, 100);
    const send = vi.fn(async () => undefined);
    await processQueue(database, send, 100);
    expect(send).toHaveBeenCalledOnce();
    expect(await getPendingMessages(database, Number.MAX_SAFE_INTEGER)).toHaveLength(0);
  });

  test('defers a failed notification and retries it later', async () => {
    await addMessage(database, 'did:plc:recipient', { type: 'blocked', did: 'did:plc:actor' }, 100);
    const failedSend = vi.fn(async () => {
      throw new Error('temporary failure');
    });
    await processQueue(database, failedSend, 100);

    expect(await getPendingMessages(database, 30_099)).toHaveLength(0);
    const deferred = await getPendingMessages(database, 30_100);
    expect(deferred).toHaveLength(1);
    expect(deferred[0].attempts).toBe(1);

    await processQueue(database, vi.fn(async () => undefined), 30_100);
    expect(await getPendingMessages(database, Number.MAX_SAFE_INTEGER)).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('./cache.mts', () => ({
  resolveDidToHandle: vi.fn(async () => 'actor.test'),
  fetchListDetails: vi.fn(),
}));

import { createDb, migrateToLatest, type Database } from './db/index.mts';
import { addMessage, getPendingMessages } from './outbox.mts';
import { isBlockedActorError, processQueue } from './common/process-queue.mts';
import { logger } from './logger.mts';

describe('durable notification outbox', () => {
  let database: Database;

  beforeEach(async () => {
    database = createDb(':memory:');
    await migrateToLatest(database);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await database.destroy();
  });

  test('deduplicates the same event for the same recipient', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const message = { type: 'blocked' as const, did: 'did:plc:actor' as const, event: '1:block-1' };
    expect(await addMessage(database, 'did:plc:recipient', message, 100)).toBe(true);
    expect(await addMessage(database, 'did:plc:recipient', message, 200)).toBe(false);
    expect(await getPendingMessages(database, 200)).toHaveLength(1);
    expect(info).toHaveBeenNthCalledWith(1, 'Notification queued', {
      key: 'did:plc:recipient:blocked:did:plc:actor:1:block-1',
      recipient: 'did:plc:recipient',
      type: 'blocked',
    });
    expect(info).toHaveBeenNthCalledWith(2, 'Duplicate notification ignored', {
      key: 'did:plc:recipient:blocked:did:plc:actor:1:block-1',
      recipient: 'did:plc:recipient',
      type: 'blocked',
    });
  });

  test('keeps the same event separately for different recipients', async () => {
    const message = {
      type: 'post' as const,
      did: 'did:plc:actor' as const,
      post: 'post-1',
      event: '1:post-1',
    };
    await addMessage(database, 'did:plc:first', message, 100);
    await addMessage(database, 'did:plc:second', message, 100);
    expect(await getPendingMessages(database, 100)).toHaveLength(2);
  });

  test('survives a database close and process-style reopen', async () => {
    await database.destroy();
    const directory = mkdtempSync(join(tmpdir(), 'lunafications-outbox-'));
    const location = join(directory, 'test.db');
    try {
      database = createDb(location);
      await migrateToLatest(database);
      await addMessage(
        database,
        'did:plc:recipient',
        { type: 'blocked', did: 'did:plc:actor', event: '1:block-1' },
        100,
      );
      await database.destroy();

      database = createDb(location);
      await migrateToLatest(database);
      expect(await getPendingMessages(database, 100)).toHaveLength(1);
    } finally {
      await database.destroy();
      database = createDb(':memory:');
      rmSync(directory, { recursive: true });
    }
  });

  test('marks a notification delivered only after successful delivery', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await addMessage(
      database,
      'did:plc:recipient',
      { type: 'blocked', did: 'did:plc:actor', event: '1:block-1' },
      100,
    );
    const send = vi.fn(async () => undefined);
    await processQueue(database, send, 100);
    expect(send).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('Notification delivered', {
      key: 'did:plc:recipient:blocked:did:plc:actor:1:block-1',
      recipient: 'did:plc:recipient',
      type: 'blocked',
      attempt: 1,
    });
    expect(await getPendingMessages(database, Number.MAX_SAFE_INTEGER)).toHaveLength(0);
  });

  test('suppresses an inclusive Jetstream replay after successful delivery', async () => {
    const message = { type: 'blocked' as const, did: 'did:plc:actor' as const, event: '1:block-1' };
    await addMessage(database, 'did:plc:recipient', message, 100);
    await processQueue(database, vi.fn(async () => undefined), 100);

    await addMessage(database, 'did:plc:recipient', message, 200);

    expect(await getPendingMessages(database, 200)).toHaveLength(0);
    const markers = await database.selectFrom('notification_outbox').selectAll().execute();
    expect(markers).toHaveLength(1);
    expect(markers[0].delivered_at).toBe(100);
  });

  test('defers a failed notification and retries it later', async () => {
    await addMessage(
      database,
      'did:plc:recipient',
      { type: 'blocked', did: 'did:plc:actor', event: '1:block-1' },
      100,
    );
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

  test('disables a blocked recipient and removes all of their pending work', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await database.insertInto('settings').values({ did: 'did:plc:blocked', blocks: 1, lists: 1 }).execute();
    await database.insertInto('post_notifications').values([
      { did: 'did:plc:blocked', from: 'did:plc:author-one' },
      { did: 'did:plc:blocked', from: 'did:plc:author-two' },
    ]).execute();
    await addMessage(database, 'did:plc:blocked', { type: 'blocked', did: 'did:plc:actor', event: '1:a' }, 100);
    await addMessage(database, 'did:plc:blocked', { type: 'blocked', did: 'did:plc:actor', event: '2:b' }, 101);
    await addMessage(database, 'did:plc:other', { type: 'blocked', did: 'did:plc:actor', event: '3:c' }, 102);
    const xrpcError = Object.assign(new Error('BlockedActor > block between recipient and sender'), {
      name: 'XRPCError',
      kind: 'BlockedActor',
    });
    const send = vi.fn(async (recipient: string) => {
      if (recipient === 'did:plc:blocked') throw new Error('Failed to create conversation.', { cause: xrpcError });
    });

    await processQueue(database, send, 102);

    expect(send).toHaveBeenCalledTimes(2);
    expect(await database.selectFrom('settings').selectAll().where('did', '=', 'did:plc:blocked').execute()).toEqual([]);
    expect(await database.selectFrom('post_notifications').selectAll().where('did', '=', 'did:plc:blocked').execute()).toEqual([]);
    expect(await database.selectFrom('notification_outbox').selectAll().where('recipient', '=', 'did:plc:blocked').execute()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Notifications disabled because a block exists between the recipient and the bot',
      {
        recipient: 'did:plc:blocked',
        reason: 'blocked_actor',
        settingsRemoved: 1,
        postSubscriptionsRemoved: 2,
        pendingMessagesRemoved: 2,
      },
    );
  });

  test('only treats the structured BlockedActor error kind as permanent', () => {
    expect(isBlockedActorError(new Error('BlockedActor > block between recipient and sender'))).toBe(false);
    expect(isBlockedActorError(new Error('wrapper', {
      cause: Object.assign(new Error('blocked'), { kind: 'BlockedActor' }),
    }))).toBe(true);
  });
});

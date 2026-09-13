import { beforeEach, describe, expect, test } from 'vitest';
import type { CommitEvent } from '@skyware/jetstream';
import { db, migrateToLatest } from './db/index.mts';
import { getPendingMessages } from './outbox.mts';
import { jetstreamBlockHandler, jetstreamFeedPostHandler, jetstreamListItemHandler } from './jetstream-handlers.mts';

await migrateToLatest(db);

beforeEach(async () => {
  await db.deleteFrom('notification_outbox').execute();
  await db.deleteFrom('post_notifications').execute();
  await db.deleteFrom('settings').execute();
});

const blockEvent = {
  did: 'did:plc:blocker',
  time_us: 100,
  commit: { operation: 'create', rkey: 'block-1', record: { subject: 'did:plc:recipient' } },
} as CommitEvent<'app.bsky.graph.block'>;

describe('Jetstream handlers', () => {
  test('queues a block only when the subject opted in', async () => {
    await jetstreamBlockHandler(blockEvent);
    expect(await getPendingMessages(db)).toHaveLength(0);

    await db.insertInto('settings').values({ did: 'did:plc:recipient', blocks: 1, lists: 0 }).execute();
    await jetstreamBlockHandler(blockEvent);
    expect((await getPendingMessages(db))[0].message).toEqual({
      type: 'blocked',
      did: 'did:plc:blocker',
      event: '100:block-1',
    });
  });

  test('ignores non-create block events', async () => {
    await jetstreamBlockHandler({ ...blockEvent, commit: { operation: 'delete' } } as CommitEvent<'app.bsky.graph.block'>);
    expect(await getPendingMessages(db)).toHaveLength(0);
  });

  test('queues list details for opted-in subjects', async () => {
    await db.insertInto('settings').values({ did: 'did:plc:recipient', blocks: 0, lists: 1 }).execute();
    await jetstreamListItemHandler({
      did: 'did:plc:list-owner',
      time_us: 200,
      commit: {
        operation: 'create',
        rkey: 'item-1',
        record: { subject: 'did:plc:recipient', list: 'at://did:plc:list-owner/app.bsky.graph.list/list-1' },
      },
    } as CommitEvent<'app.bsky.graph.listitem'>);
    expect((await getPendingMessages(db))[0].message).toEqual({
      type: 'list',
      did: 'did:plc:list-owner',
      list: 'list-1',
      event: '200:item-1',
    });
  });

  test('fans a top-level post out to every subscriber but ignores replies', async () => {
    await db
      .insertInto('post_notifications')
      .values([
        { did: 'did:plc:first', from: 'did:plc:author' },
        { did: 'did:plc:second', from: 'did:plc:author' },
      ])
      .execute();
    const event = {
      did: 'did:plc:author',
      time_us: 300,
      commit: { operation: 'create', rkey: 'post-1', record: { text: 'hello' } },
    } as CommitEvent<'app.bsky.feed.post'>;
    await jetstreamFeedPostHandler(event);
    expect((await getPendingMessages(db)).map((item) => item.recipient).sort()).toEqual([
      'did:plc:first',
      'did:plc:second',
    ]);

    await jetstreamFeedPostHandler({
      ...event,
      time_us: 301,
      commit: { ...event.commit, rkey: 'reply-1', record: { text: 'reply', reply: {} } },
    } as CommitEvent<'app.bsky.feed.post'>);
    expect(await getPendingMessages(db)).toHaveLength(2);
  });
});

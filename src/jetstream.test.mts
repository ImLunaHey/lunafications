import { expect, test } from 'vitest';
import type { CommitEvent } from '@skyware/jetstream';
import { createDb, migrateToLatest } from './db/index.mts';
import { processJetstreamCommit } from './jetstream.mts';

const event = {
  did: 'did:plc:blocker',
  time_us: 123_456,
  commit: {
    collection: 'app.bsky.graph.block',
    operation: 'create',
    rkey: 'block-1',
    record: { subject: 'did:plc:recipient' },
  },
} as CommitEvent<'app.bsky.graph.block'>;

test('persists a cursor only after durable event processing', async () => {
  const database = createDb(':memory:');
  try {
    await migrateToLatest(database);
    await database.insertInto('settings').values({ did: 'did:plc:recipient', blocks: 1, lists: 0 }).execute();

    await processJetstreamCommit(event, database);

    expect(await database.selectFrom('notification_outbox').selectAll().execute()).toHaveLength(1);
    expect(await database.selectFrom('app_state').select('value').where('key', '=', 'jetstream_cursor').executeTakeFirst()).toEqual({
      value: '123456',
    });
  } finally {
    await database.destroy();
  }
});

test('does not advance the cursor when durable event processing fails', async () => {
  const database = createDb(':memory:');
  try {
    await migrateToLatest(database);
    await database.insertInto('settings').values({ did: 'did:plc:recipient', blocks: 1, lists: 0 }).execute();
    await database.schema.dropTable('notification_outbox').execute();

    await expect(processJetstreamCommit(event, database)).rejects.toThrow();
    expect(await database.selectFrom('app_state').selectAll().execute()).toEqual([]);
  } finally {
    await database.destroy();
  }
});

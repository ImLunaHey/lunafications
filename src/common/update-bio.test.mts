import { beforeEach, expect, test } from 'vitest';
import { db, migrateToLatest } from '../db/index.mts';
import { getUserCount } from './update-bio.mts';

await migrateToLatest(db);

beforeEach(async () => {
  await db.deleteFrom('post_notifications').execute();
  await db.deleteFrom('settings').execute();
});

test('counts the union of active notification users', async () => {
  await db
    .insertInto('settings')
    .values([
      { did: 'did:plc:block-user', blocks: 1, lists: 0 },
      { did: 'did:plc:inactive-user', blocks: 0, lists: 0 },
      { did: 'did:plc:both', blocks: 0, lists: 1 },
    ])
    .execute();
  await db
    .insertInto('post_notifications')
    .values([
      { did: 'did:plc:post-user', from: 'did:plc:first-author' },
      { did: 'did:plc:post-user', from: 'did:plc:second-author' },
      { did: 'did:plc:both', from: 'did:plc:first-author' },
    ])
    .execute();

  expect(await getUserCount()).toBe(3);
});

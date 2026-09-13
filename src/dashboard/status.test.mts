import { afterEach, beforeEach, expect, test } from 'vitest';
import { createDb, migrateToLatest, type Database } from '../db/index.mts';
import { runtimeState } from '../runtime-state.mts';
import { getDashboardStatus } from './status.mts';

let database: Database;
beforeEach(async () => {
  database = createDb(':memory:');
  await migrateToLatest(database);
});
afterEach(async () => database.destroy());

test('reports subscriptions, outbox health, cursor, runtime, and memory', async () => {
  await database.insertInto('settings').values([
    { did: 'did:one', blocks: 1, lists: 0 },
    { did: 'did:two', blocks: 1, lists: 1 },
  ]).execute();
  await database.insertInto('post_notifications').values([
    { did: 'did:one', from: 'did:author-one' },
    { did: 'did:one', from: 'did:author-two' },
  ]).execute();
  await database.insertInto('notification_outbox').values([
    { key: 'pending', recipient: 'did:one', payload: '{}', attempts: 0, available_at: 1, created_at: 1, delivered_at: null },
    { key: 'retrying', recipient: 'did:one', payload: '{}', attempts: 2, available_at: 1, created_at: 1, delivered_at: null },
    { key: 'done', recipient: 'did:one', payload: '{}', attempts: 0, available_at: 1, created_at: 1, delivered_at: 2 },
  ]).execute();
  await database.insertInto('app_state').values({ key: 'jetstream_cursor', value: '12345' }).execute();
  runtimeState.jetstreamConnected = true;
  runtimeState.jetstreamLastEventAt = 900;
  runtimeState.lastQueueRunAt = 950;
  runtimeState.lastDeliveryAt = 975;

  const status = await getDashboardStatus(database, 1_000);
  expect(status.subscriptions).toEqual({ settingsRows: 2, blockUsers: 2, listUsers: 1, postUsers: 1 });
  expect(status.queue).toMatchObject({ pending: 2, retrying: 1, deliveredMarkers: 1, lastRunAt: 950, lastDeliveryAt: 975 });
  expect(status.jetstream).toMatchObject({ connected: true, cursor: '12345', lastEventAt: 900 });
  expect(status.memory.rss).toBeGreaterThan(0);
});

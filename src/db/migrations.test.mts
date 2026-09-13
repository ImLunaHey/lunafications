import { expect, test } from 'vitest';
import { Migrator } from 'kysely';
import { createDb, migrateToLatest } from './index.mts';
import { migrationProvider } from './migrations.mts';

test('upgrades an existing database without losing subscriptions', async () => {
  const database = createDb(':memory:');
  try {
    const migrator = new Migrator({ db: database, provider: migrationProvider });
    const oldMigration = await migrator.migrateTo('002');
    expect(oldMigration.error).toBeUndefined();
    await database.insertInto('settings').values({ did: 'did:plc:user', blocks: 1, lists: 0 }).execute();
    await database
      .insertInto('post_notifications')
      .values({ did: 'did:plc:user', from: 'did:plc:author' })
      .execute();

    await migrateToLatest(database);

    expect(await database.selectFrom('settings').selectAll().execute()).toHaveLength(1);
    expect(await database.selectFrom('post_notifications').selectAll().execute()).toHaveLength(1);
    expect(await database.selectFrom('notification_outbox').selectAll().execute()).toEqual([]);
    expect(await database.selectFrom('app_state').selectAll().execute()).toEqual([]);
  } finally {
    await database.destroy();
  }
});

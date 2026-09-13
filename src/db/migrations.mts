import { Kysely, Migration, MigrationProvider } from 'kysely';

const migrations: Record<string, Migration> = {};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('settings')
      .addColumn('did', 'varchar', (col) => col.notNull().primaryKey())
      .addColumn('blocks', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('lists', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('settings').execute();
  },
};

migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post_notifications')
      .addColumn('did', 'varchar', (col) => col.notNull())
      .addColumn('from', 'varchar', (col) => col.notNull())
      .addUniqueConstraint('unique_user_from', ['did', 'from'])
      .execute();

    await db.schema.createIndex('idx_did').on('post_notifications').column('did').execute();
    await db.schema.createIndex('idx_from').on('post_notifications').column('from').execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post_notifications').execute();
  },
};

migrations['003'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('notification_outbox')
      .addColumn('key', 'varchar', (col) => col.notNull().primaryKey())
      .addColumn('recipient', 'varchar', (col) => col.notNull())
      .addColumn('payload', 'text', (col) => col.notNull())
      .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('available_at', 'integer', (col) => col.notNull())
      .addColumn('created_at', 'integer', (col) => col.notNull())
      .addColumn('delivered_at', 'integer')
      .execute();
    await db.schema
      .createIndex('idx_notification_outbox_available')
      .on('notification_outbox')
      .columns(['available_at', 'created_at'])
      .execute();
    await db.schema
      .createIndex('idx_notification_outbox_delivered')
      .on('notification_outbox')
      .column('delivered_at')
      .execute();

    await db.schema
      .createTable('app_state')
      .addColumn('key', 'varchar', (col) => col.notNull().primaryKey())
      .addColumn('value', 'text', (col) => col.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('app_state').execute();
    await db.schema.dropTable('notification_outbox').execute();
  },
};

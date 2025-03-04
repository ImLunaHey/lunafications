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

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

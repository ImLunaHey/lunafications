import SqliteDb from 'better-sqlite3';
import { CompiledQuery, Kysely, Migrator, SqliteDialect } from 'kysely';
import { DatabaseSchema } from './schema.mts';
import { migrationProvider } from './migrations.mts';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const sqliteLocation = process.env.SQLITE_LOCATION || ':memory:';
if (sqliteLocation !== ':memory:') {
  const sqliteDirectory = dirname(sqliteLocation);
  if (sqliteDirectory !== '.') mkdirSync(sqliteDirectory, { recursive: true });
}

export const createDb = (location: string): Database => {
  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: new SqliteDb(location),
      onCreateConnection: async (connection) => {
        await connection.executeQuery(CompiledQuery.raw(`PRAGMA journal_mode = WAL`));
      },
    }),
  });
};

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
};

export type Database = Kysely<DatabaseSchema>;

export const db = createDb(sqliteLocation);

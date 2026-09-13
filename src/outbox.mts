import type { Database } from './db/index.mts';
import type { Message } from './queue.mts';
import { resolveMessageKey } from './queue.mts';
import { logger } from './logger.mts';

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60 * 1000;

export const addMessage = async (db: Database, recipient: string, message: Message, now = Date.now()) => {
  const key = resolveMessageKey(recipient, message);
  await db
    .insertInto('notification_outbox')
    .values({ key, recipient, payload: JSON.stringify(message), attempts: 0, available_at: now, created_at: now })
    .onConflict((conflict) => conflict.column('key').doNothing())
    .execute();
  logger.info('Added message to outbox', { recipient, type: message.type });
};

export const getPendingMessages = async (db: Database, now = Date.now(), limit = 100) => {
  const rows = await db
    .selectFrom('notification_outbox')
    .selectAll()
    .where('available_at', '<=', now)
    .orderBy('created_at')
    .limit(limit)
    .execute();

  return rows.map((row) => ({ ...row, message: JSON.parse(row.payload) as Message }));
};

export const markMessageSent = async (db: Database, key: string) => {
  await db.deleteFrom('notification_outbox').where('key', '=', key).execute();
};

export const deferMessage = async (db: Database, key: string, attempts: number, now = Date.now()) => {
  const delay = Math.min(RETRY_BASE_MS * 2 ** Math.min(attempts, 10), RETRY_MAX_MS);
  await db
    .updateTable('notification_outbox')
    .set({ attempts: attempts + 1, available_at: now + delay })
    .where('key', '=', key)
    .execute();
};

import type { Database } from './db/index.mts';
import type { Message } from './queue.mts';
import { resolveMessageKey } from './queue.mts';
import { logger } from './logger.mts';

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60 * 1000;
const DELIVERED_RETENTION_MS = 48 * 60 * 60 * 1000;

export const addMessage = async (db: Database, recipient: string, message: Message, now = Date.now()) => {
  const key = resolveMessageKey(recipient, message);
  const result = await db
    .insertInto('notification_outbox')
    .values({
      key,
      recipient,
      payload: JSON.stringify(message),
      attempts: 0,
      available_at: now,
      created_at: now,
      delivered_at: null,
    })
    .onConflict((conflict) => conflict.column('key').doNothing())
    .executeTakeFirst();
  const queued = Number(result.numInsertedOrUpdatedRows ?? 0) === 1;
  if (queued) {
    logger.info('Notification queued', { key, recipient, type: message.type });
  } else {
    logger.info('Duplicate notification ignored', { key, recipient, type: message.type });
  }
  return queued;
};

export const getPendingMessages = async (db: Database, now = Date.now(), limit = 100) => {
  await db
    .deleteFrom('notification_outbox')
    .where('delivered_at', 'is not', null)
    .where('delivered_at', '<', now - DELIVERED_RETENTION_MS)
    .execute();
  const rows = await db
    .selectFrom('notification_outbox')
    .selectAll()
    .where('available_at', '<=', now)
    .where('delivered_at', 'is', null)
    .orderBy('created_at')
    .limit(limit)
    .execute();

  return rows.map((row) => ({ ...row, message: JSON.parse(row.payload) as Message }));
};

export const markMessageSent = async (db: Database, key: string, now = Date.now()) => {
  await db.updateTable('notification_outbox').set({ delivered_at: now }).where('key', '=', key).execute();
};

export const deferMessage = async (db: Database, key: string, attempts: number, now = Date.now()) => {
  const delay = Math.min(RETRY_BASE_MS * 2 ** Math.min(attempts, 10), RETRY_MAX_MS);
  await db
    .updateTable('notification_outbox')
    .set({ attempts: attempts + 1, available_at: now + delay })
    .where('key', '=', key)
    .execute();
};

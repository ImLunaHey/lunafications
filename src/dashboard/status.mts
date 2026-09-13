import type { Database } from '../db/index.mts';
import { runtimeState } from '../runtime-state.mts';

const asNumber = (value: string | number | bigint | null | undefined) => Number(value ?? 0);

export const getDashboardStatus = async (database: Database, now = Date.now()) => {
  const [settings, postUsers, pending, retrying, delivered, cursor] = await Promise.all([
    database
      .selectFrom('settings')
      .select([
        database.fn.countAll().as('users'),
        database.fn.sum('blocks').as('blocks'),
        database.fn.sum('lists').as('lists'),
      ])
      .executeTakeFirstOrThrow(),
    database.selectFrom('post_notifications').select(database.fn.count('did').distinct().as('users')).executeTakeFirst(),
    database
      .selectFrom('notification_outbox')
      .select(database.fn.countAll().as('count'))
      .where('delivered_at', 'is', null)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom('notification_outbox')
      .select(database.fn.countAll().as('count'))
      .where('delivered_at', 'is', null)
      .where('attempts', '>', 0)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom('notification_outbox')
      .select(database.fn.countAll().as('count'))
      .where('delivered_at', 'is not', null)
      .executeTakeFirstOrThrow(),
    database.selectFrom('app_state').select('value').where('key', '=', 'jetstream_cursor').executeTakeFirst(),
  ]);
  const memory = process.memoryUsage();
  return {
    generatedAt: now,
    uptimeSeconds: Math.floor((now - runtimeState.startedAt) / 1000),
    jetstream: {
      connected: runtimeState.jetstreamConnected,
      cursor: cursor?.value ?? null,
      lastEventAt: runtimeState.jetstreamLastEventAt,
      lastError: runtimeState.jetstreamLastError,
    },
    queue: {
      pending: asNumber(pending.count),
      retrying: asNumber(retrying.count),
      deliveredMarkers: asNumber(delivered.count),
      lastRunAt: runtimeState.lastQueueRunAt,
      lastDeliveryAt: runtimeState.lastDeliveryAt,
      lastError: runtimeState.lastDeliveryError,
    },
    subscriptions: {
      settingsRows: asNumber(settings.users),
      blockUsers: asNumber(settings.blocks),
      listUsers: asNumber(settings.lists),
      postUsers: asNumber(postUsers?.users),
    },
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
    },
  };
};

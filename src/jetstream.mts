import { Jetstream, type CommitEvent } from '@skyware/jetstream';
import { jetstreamBlockHandler, jetstreamListItemHandler, jetstreamFeedPostHandler } from './jetstream-handlers.mts';
import { db, type Database } from './db/index.mts';
import { logger } from './logger.mts';
import { runtimeState } from './runtime-state.mts';

const CURSOR_KEY = 'jetstream_cursor';

export const processJetstreamCommit = async (event: CommitEvent<string>, database: Database = db) => {
  switch (event.commit.collection) {
    case 'app.bsky.graph.block':
      await jetstreamBlockHandler(event as CommitEvent<'app.bsky.graph.block'>, database);
      break;
    case 'app.bsky.graph.listitem':
      await jetstreamListItemHandler(event as CommitEvent<'app.bsky.graph.listitem'>, database);
      break;
    case 'app.bsky.feed.post':
      await jetstreamFeedPostHandler(event as CommitEvent<'app.bsky.feed.post'>, database);
      break;
  }

  await database
    .insertInto('app_state')
    .values({ key: CURSOR_KEY, value: String(event.time_us) })
    .onConflict((conflict) => conflict.column('key').doUpdateSet({ value: String(event.time_us) }))
    .execute();
};

export const startJetstream = async () => {
  const storedCursor = await db.selectFrom('app_state').select('value').where('key', '=', CURSOR_KEY).executeTakeFirst();
  const cursor = storedCursor ? Number(storedCursor.value) : undefined;
  const jetstream = new Jetstream({
    wantedCollections: ['app.bsky.graph.block', 'app.bsky.graph.listitem', 'app.bsky.feed.post'],
    ...(Number.isFinite(cursor) ? { cursor } : {}),
  });

  let pipeline = Promise.resolve();
  jetstream.on('commit', (event) => {
    runtimeState.jetstreamLastEventAt = Date.now();
    pipeline = pipeline.then(() => processJetstreamCommit(event));
    void pipeline.catch((error) => {
      logger.error('Failed to process Jetstream event', { cursor: event.time_us }, error);
      jetstream.close();
      process.exit(1);
    });
  });
  jetstream.on('open', () => {
    runtimeState.jetstreamConnected = true;
    runtimeState.jetstreamLastError = null;
  });
  jetstream.on('close', () => {
    runtimeState.jetstreamConnected = false;
  });
  jetstream.on('error', (error: unknown) => {
    runtimeState.jetstreamLastError = error instanceof Error ? error.message : String(error);
    logger.error('Jetstream encountered an error', error);
  });
  jetstream.start();
  return jetstream;
};

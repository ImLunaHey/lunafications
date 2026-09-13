import { Jetstream, type CommitEvent } from '@skyware/jetstream';
import { jetstreamBlockHandler, jetstreamListItemHandler, jetstreamFeedPostHandler } from './jetstream-handlers.mts';
import { db } from './db/index.mts';
import { logger } from './logger.mts';

const CURSOR_KEY = 'jetstream_cursor';

const handleCommit = async (event: CommitEvent<string>) => {
  switch (event.commit.collection) {
    case 'app.bsky.graph.block':
      await jetstreamBlockHandler(event as CommitEvent<'app.bsky.graph.block'>);
      break;
    case 'app.bsky.graph.listitem':
      await jetstreamListItemHandler(event as CommitEvent<'app.bsky.graph.listitem'>);
      break;
    case 'app.bsky.feed.post':
      await jetstreamFeedPostHandler(event as CommitEvent<'app.bsky.feed.post'>);
      break;
  }

  await db
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
    pipeline = pipeline.then(() => handleCommit(event));
    void pipeline.catch((error) => {
      logger.error('Failed to process Jetstream event', { cursor: event.time_us }, error);
      jetstream.close();
      process.exit(1);
    });
  });
  jetstream.on('error', (error: unknown) => logger.error('Jetstream encountered an error', error));
  jetstream.start();
  return jetstream;
};

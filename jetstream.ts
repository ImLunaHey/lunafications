import { CommitCreateEvent, Jetstream } from '@skyware/jetstream';
import { migrateToLatest, db } from './db';

export const jetstream = new Jetstream({
  wantedCollections: ['app.bsky.feed.post'],
  wantedDids: [],
});

const storeRawEvent = async (event: CommitCreateEvent<'app.bsky.feed.post'>) => {
  await db
    .insertInto('posts')
    .values({
      author: event.did,
      uri: `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`,
      cid: event.commit.cid,
      text: event.commit.record.text,
      indexedAt: new Date().toISOString(),
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
};

jetstream.onCreate('app.bsky.feed.post', async (event) => {
  try {
    await storeRawEvent(event);
    console.info('post processed', event.commit.rkey);
  } catch (error) {
    console.error('Error indexing post', error);
  }
});

jetstream.onDelete('app.bsky.feed.post', async (event) => {
  await db.deleteFrom('posts').where('uri', '=', `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`).execute();
});

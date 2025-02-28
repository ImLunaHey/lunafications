import { Jetstream } from '@skyware/jetstream';
import { addMessage } from './queue.mts';
import { db } from './db/index.mts';

export const jetstream = new Jetstream({
  wantedCollections: ['app.bsky.graph.*'],
});

jetstream.on('app.bsky.graph.block', async (event) => {
  try {
    if (event.commit.operation !== 'create') return;

    // account who was blocked
    const subject = event.commit.record.subject;

    // account who did the blocking
    const did = event.did;

    // check if the account wants to receive block notifications
    const settings = await db.selectFrom('settings').selectAll().where('did', '=', subject).executeTakeFirst();
    if (!settings?.blocks) return;

    // add message to the queue
    addMessage(subject, {
      type: 'blocked',
      did: did,
    });
  } catch (error) {
    console.error('Failed to process block event:', error);
  }
});

jetstream.on('app.bsky.graph.listitem', async (event) => {
  try {
    if (event.commit.operation !== 'create') return;

    // account who was added to the list
    const subject = event.commit.record.subject;

    // check if the account wants to receive block notifications
    const settings = await db.selectFrom('settings').selectAll().where('did', '=', subject).executeTakeFirst();
    if (!settings?.lists) return;

    // account who owns the list
    const did = event.did;

    // add message to the queue
    addMessage(subject, {
      type: 'list',
      list: event.commit.record.list,
      did,
    });
  } catch (error) {
    console.error('Failed to process list event:', error);
  }
});

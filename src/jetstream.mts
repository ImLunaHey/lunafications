import { Jetstream } from '@skyware/jetstream';
import { addMessage } from './queue.mts';
import { db } from './db/index.mts';
import { RichText } from '@skyware/bot';

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

    const handle = await fetch(`https://plc.directory/${did}`)
      .then((res) => res.json())
      .then((data) => data.alsoKnownAs[0].split('at://')[1]);

    addMessage(subject, new RichText().addText('You were blocked by ').addMention(handle, did));
  } catch (error) {
    console.error('Failed to process block event:', error);
  }
});

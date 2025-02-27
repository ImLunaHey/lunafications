import { Jetstream } from '@skyware/jetstream';
import { addMessage } from './queue.mts';
import { db } from './db/index.mts';
import { RichText } from '@skyware/bot';
import { TimeCache } from './time-cache.mts';
import { BskyAgent } from '@atproto/api';

const publicAgent = new BskyAgent({
  service: 'https://public.api.bsky.app',
});

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

const ONE_MINUTE = 60_000;
const listNameCache = new TimeCache(ONE_MINUTE);

const getListName = async (list: string) => {
  const cachedName = listNameCache.get(list);
  if (cachedName) return cachedName;

  const name = await publicAgent.app.bsky.graph
    .getList({
      list,
    })
    .then((list) => list.data.list.name);
  listNameCache.set(list, name);
  return name;
};

jetstream.on('app.bsky.graph.listitem', async (event) => {
  try {
    if (event.commit.operation !== 'create') return;

    // account who was added to the list
    const subject = event.commit.record.subject;

    // check if the account wants to receive block notifications
    const settings = await db.selectFrom('settings').selectAll().where('did', '=', subject).executeTakeFirst();
    if (!settings?.lists) return;

    // name of the list
    const list = await getListName(event.commit.record.list);

    // account who owns the list
    const did = event.did;

    const handle = await fetch(`https://plc.directory/${did}`)
      .then((res) => res.json())
      .then((data) => data.alsoKnownAs[0].split('at://')[1]);

    addMessage(
      subject,
      new RichText().addText('You were added to the "').addText(list).addText('" list by ').addMention(handle, did),
    );
  } catch (error) {
    console.error('Failed to process block event:', error);
  }
});

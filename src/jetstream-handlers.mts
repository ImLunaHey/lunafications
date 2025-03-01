import { CommitEvent } from '@skyware/jetstream';
import { addMessage } from './queue.mts';
import { db } from './db/index.mts';

export const jetstreamBlockHandler = async (event: CommitEvent<'app.bsky.graph.block'>) => {
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
};

export const jetstreamListItemHandler = async (event: CommitEvent<'app.bsky.graph.listitem'>) => {
  try {
    if (event.commit.operation !== 'create') return;

    // account who was added to the list
    const subject = event.commit.record.subject;

    // check if the account wants to receive list notifications
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
};

export const jetstreamFeedPostHandler = async (event: CommitEvent<'app.bsky.feed.post'>) => {
  try {
    if (event.commit.operation !== 'create') return;

    // id of the post
    const id = event.commit.cid;

    // account who made the post
    const from = event.did;

    // check who wants to receive post notifications about this account
    const accountsToNotify = await db.selectFrom('post_notifications').select('did').where('from', '=', from).execute();
    if (accountsToNotify.length === 0) return;

    for (const accounts of accountsToNotify) {
      // add message to the queue
      addMessage(accounts.did, {
        type: 'post',
        post: id,
        did: from,
      });
    }
  } catch (error) {
    console.error('Failed to process list event:', error);
  }
};

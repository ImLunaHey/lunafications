import { CommitEvent } from '@skyware/jetstream';
import { addMessage } from './outbox.mts';
import { db, type Database } from './db/index.mts';
import { logger } from './logger.mts';

export const jetstreamBlockHandler = async (event: CommitEvent<'app.bsky.graph.block'>, database: Database = db) => {
  try {
    if (event.commit.operation !== 'create') return;

    // account who was blocked
    const subject = event.commit.record.subject;

    // account who did the blocking
    const did = event.did;

    // check if the account wants to receive block notifications
    const settings = await database.selectFrom('settings').selectAll().where('did', '=', subject).executeTakeFirst();
    if (!settings?.blocks) return;

    // add message to the queue
    await addMessage(database, subject, {
      type: 'blocked',
      did: did,
      event: `${event.time_us}:${event.commit.rkey}`,
    });
  } catch (error) {
    logger.error('Failed to process block event:', error);
    throw error;
  }
};

export const jetstreamListItemHandler = async (
  event: CommitEvent<'app.bsky.graph.listitem'>,
  database: Database = db,
) => {
  try {
    if (event.commit.operation !== 'create') return;

    // account who was added to the list
    const subject = event.commit.record.subject;

    // check if the account wants to receive list notifications
    const settings = await database.selectFrom('settings').selectAll().where('did', '=', subject).executeTakeFirst();
    if (!settings?.lists) return;

    // account who owns the list
    const did = event.did;

    // add message to the queue
    await addMessage(database, subject, {
      type: 'list',
      list: event.commit.record.list.split('/').pop()!,
      did,
      event: `${event.time_us}:${event.commit.rkey}`,
    });
  } catch (error) {
    logger.error('Failed to process list event:', error);
    throw error;
  }
};

export const jetstreamFeedPostHandler = async (
  event: CommitEvent<'app.bsky.feed.post'>,
  database: Database = db,
) => {
  try {
    if (event.commit.operation !== 'create') return;

    // id of the post
    const id = event.commit.rkey;

    // account who made the post
    const from = event.did;

    // check that this is a top post and not a reply
    if (event.commit.record.reply) return;

    // check who wants to receive post notifications about this account
    const accountsToNotify = await database
      .selectFrom('post_notifications')
      .select('did')
      .where('from', '=', from)
      .execute();
    if (accountsToNotify.length === 0) return;

    for (const accounts of accountsToNotify) {
      // add message to the queue
      await addMessage(database, accounts.did, {
        type: 'post',
        post: id,
        did: from,
        event: `${event.time_us}:${event.commit.rkey}`,
      });
    }
  } catch (error) {
    logger.error('Failed to process post event:', error);
    throw error;
  }
};

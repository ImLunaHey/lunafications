import { CommitEvent } from '@skyware/jetstream';
import { addMessage } from './queue.mts';
import { db } from './db/index.mts';
import { isExternal, isViewExternal } from '@atproto/api/dist/client/types/app/bsky/embed/external.js';

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
      list: event.commit.record.list.split('/')[3],
      did,
    });
  } catch (error) {
    console.error('Failed to process list event:', error);
  }
};

const postNotificationHandler = async (event: CommitEvent<'app.bsky.feed.post'>) => {
  try {
    if (event.commit.operation !== 'create') return;

    // id of the post
    const id = event.commit.rkey;

    // account who made the post
    const from = event.did;

    // check that this is a top post and not a reply
    if (event.commit.record.reply) return;

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
    console.error('Failed to process post event:', error);
  }
};

const domainNotificationHandler = async (event: CommitEvent<'app.bsky.feed.post'>) => {
  try {
    if (event.commit.operation !== 'create') return;

    // id of the post
    const id = event.commit.rkey;

    // account who made the post
    const from = event.did;

    // extract urls from the post
    const urlsFromText = event.commit.record.text.match(/https?:\/\/[^\s]+/g) ?? [];
    const urlsFromEmbed =
      event.commit.record.embed?.$type === 'app.bsky.embed.external' ? [event.commit.record.embed.external.uri] : [];
    const urls = [...urlsFromText, ...urlsFromEmbed];
    if (!urls) return;

    // extract domains from the urls
    const domains = urls.map((url) => {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    });

    // check who wants to receive notifications about these domains
    const accountsToNotify = await db
      .selectFrom('domain_notifications')
      .select('did')
      .where('domain', 'in', domains)
      .execute();
    if (accountsToNotify.length === 0) return;

    for (const accounts of accountsToNotify) {
      // add message to the queue
      addMessage(accounts.did, {
        type: 'domain',
        post: id,
        did: from,
        domains: domains,
        urls: urls,
      });
    }
  } catch (error) {
    console.error('Failed to process post event:', error);
  }
};

export const jetstreamFeedPostHandler = async (event: CommitEvent<'app.bsky.feed.post'>) => {
  try {
    await Promise.all([postNotificationHandler(event), domainNotificationHandler(event)]);
  } catch (error) {
    console.error('Failed to process post event:', error);
  }
};

import { bot } from '../bot.mts';
import { db, type Database } from '../db/index.mts';
import { messagesToRichText } from '../queue.mts';
import { deferMessage, getPendingMessages, markMessageSent } from '../outbox.mts';
import { logger } from '../logger.mts';

type MessageSender = (recipient: string, text: Awaited<ReturnType<typeof messagesToRichText>>) => Promise<void>;

const defaultSender: MessageSender = async (recipient, text) => {
  const conversation = await bot.getConversationForMembers([recipient]);
  await conversation.sendMessage({ text });
};

export const isBlockedActorError = (error: unknown) => {
  let current = error;
  for (let depth = 0; depth < 10 && current && typeof current === 'object'; depth++) {
    const candidate = current as { kind?: unknown; cause?: unknown };
    if (candidate.kind === 'BlockedActor') return true;
    current = candidate.cause;
  }
  return false;
};

const disableBlockedRecipient = async (database: Database, recipient: string) =>
  database.transaction().execute(async (transaction) => {
    const settings = await transaction.deleteFrom('settings').where('did', '=', recipient).executeTakeFirst();
    const postSubscriptions = await transaction
      .deleteFrom('post_notifications')
      .where('did', '=', recipient)
      .executeTakeFirst();
    const pendingMessages = await transaction
      .deleteFrom('notification_outbox')
      .where('recipient', '=', recipient)
      .where('delivered_at', 'is', null)
      .executeTakeFirst();
    return {
      settingsRemoved: Number(settings.numDeletedRows),
      postSubscriptionsRemoved: Number(postSubscriptions.numDeletedRows),
      pendingMessagesRemoved: Number(pendingMessages.numDeletedRows),
    };
  });

export const processQueue = async (
  database: Database = db,
  sendMessage: MessageSender = defaultSender,
  now = Date.now(),
) => {
  const pending = await getPendingMessages(database, now);
  const disabledRecipients = new Set<string>();
  for (const item of pending) {
    if (disabledRecipients.has(item.recipient)) continue;
    try {
      await sendMessage(item.recipient, await messagesToRichText([item.message]));
      await markMessageSent(database, item.key, now);
      logger.info('Notification delivered', {
        key: item.key,
        recipient: item.recipient,
        type: item.message.type,
        attempt: item.attempts + 1,
      });
    } catch (error) {
      if (isBlockedActorError(error)) {
        const removed = await disableBlockedRecipient(database, item.recipient);
        disabledRecipients.add(item.recipient);
        logger.warn('Notifications disabled because a block exists between the recipient and the bot', {
          recipient: item.recipient,
          reason: 'blocked_actor',
          ...removed,
        });
        continue;
      }
      await deferMessage(database, item.key, item.attempts, now);
      logger.error('Failed to send message; deferred for retry', { recipient: item.recipient, key: item.key }, error);
    }
  }
};

export const startQueueProcessor = (intervalMs = 30_000) => {
  const run = async () => {
    try {
      await processQueue();
    } catch (error) {
      logger.error('Queue processing failed', error);
    } finally {
      setTimeout(run, intervalMs);
    }
  };
  setTimeout(run, intervalMs);
};

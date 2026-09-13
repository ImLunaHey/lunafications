import { bot } from '../bot.mts';
import { db, type Database } from '../db/index.mts';
import { messagesToRichText } from '../queue.mts';
import { deferMessage, getPendingMessages, markMessageSent } from '../outbox.mts';
import { logger } from '../logger.mts';
import { runtimeState } from '../runtime-state.mts';

type MessageSender = (recipient: string, text: Awaited<ReturnType<typeof messagesToRichText>>) => Promise<void>;

const defaultSender: MessageSender = async (recipient, text) => {
  const conversation = await bot.getConversationForMembers([recipient]);
  await conversation.sendMessage({ text });
};

type PermanentRecipientFailure = 'blocked_actor' | 'recipient_not_found';

export const getPermanentRecipientFailure = (error: unknown): PermanentRecipientFailure | null => {
  let current = error;
  for (let depth = 0; depth < 10 && current && typeof current === 'object'; depth++) {
    const candidate = current as { kind?: unknown; cause?: unknown };
    if (candidate.kind === 'BlockedActor') return 'blocked_actor';
    if (candidate.kind === 'RecipientNotFound') return 'recipient_not_found';
    current = candidate.cause;
  }
  return null;
};

export const isBlockedActorError = (error: unknown) => getPermanentRecipientFailure(error) === 'blocked_actor';

const disableRecipient = async (database: Database, recipient: string) =>
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
  runtimeState.lastQueueRunAt = now;
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
      runtimeState.lastDeliveryAt = now;
      runtimeState.lastDeliveryError = null;
    } catch (error) {
      const permanentFailure = getPermanentRecipientFailure(error);
      if (permanentFailure) {
        const removed = await disableRecipient(database, item.recipient);
        disabledRecipients.add(item.recipient);
        const message =
          permanentFailure === 'blocked_actor'
            ? 'Notifications disabled because a block exists between the recipient and the bot'
            : 'Notifications disabled because the recipient account no longer exists';
        logger.warn(message, {
          recipient: item.recipient,
          reason: permanentFailure,
          ...removed,
        });
        continue;
      }
      await deferMessage(database, item.key, item.attempts, now);
      logger.error('Failed to send message; deferred for retry', { recipient: item.recipient, key: item.key }, error);
      runtimeState.lastDeliveryError = error instanceof Error ? error.message : String(error);
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

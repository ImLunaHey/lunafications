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

export const processQueue = async (
  database: Database = db,
  sendMessage: MessageSender = defaultSender,
  now = Date.now(),
) => {
  const pending = await getPendingMessages(database, now);
  for (const item of pending) {
    try {
      await sendMessage(item.recipient, await messagesToRichText([item.message]));
      await markMessageSent(database, item.key);
    } catch (error) {
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

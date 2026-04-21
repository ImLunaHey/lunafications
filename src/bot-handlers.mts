import { ChatMessage } from '@skyware/bot';
import { createReply } from './common/create-reply.mts';
import { logger } from './logger.mts';
import { TimeCache } from './time-cache.mts';

const processedMessages = new TimeCache<boolean>(60 * 60 * 1000);

export const chatMessageHandler = async (message: ChatMessage) => {
  if (processedMessages.get(message.id)) {
    logger.debug(`Skipping duplicate message ${message.id}`);
    return;
  }

  try {
    const sender = await message.getSender();
    logger.info(`Received message from @${sender.handle}: ${message.text}`);

    const conversation = await message.getConversation();
    if (!conversation) return;

    await conversation.sendMessage({
      text: await createReply(sender, message),
    });

    processedMessages.set(message.id, true);
  } catch (error) {
    logger.error(error);
  }
};

export const chatErrorHandler = async (error: unknown) => {
  logger.error('Bot error:', error instanceof Error ? error : new Error(String(error)));

  const message = error instanceof Error ? error.message : String(error);
  if (/AuthMissing|ExpiredToken|InvalidToken/.test(message)) {
    logger.error('Session lost, exiting for restart');
    process.exit(1);
  }
};

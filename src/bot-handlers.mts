import { ChatMessage } from '@skyware/bot';
import { createReply } from './common/create-reply.mts';
import { logger } from './logger.mts';

export const chatMessageHandler = async (message: ChatMessage) => {
  try {
    const sender = await message.getSender();
    logger.info(`Received message from @${sender.handle}: ${message.text}`);

    const conversation = await message.getConversation();
    if (!conversation) return;

    await conversation.sendMessage({
      text: await createReply(sender, message),
    });
  } catch (error) {
    logger.error(error);
  }
};

export const chatErrorHandler = async (error: unknown) => {
  logger.error('Bot error:', error instanceof Error ? error : new Error(String(error)));
};

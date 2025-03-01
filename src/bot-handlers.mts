import { ChatMessage } from '@skyware/bot';
import { createReply } from './common/create-reply.mts';

export const chatMessageHandler = async (message: ChatMessage) => {
  try {
    const sender = await message.getSender();
    console.log(`Received message from @${sender.handle}: ${message.text}`);

    const conversation = await message.getConversation();
    if (!conversation) return;

    await conversation.sendMessage({
      text: await createReply(sender, message),
    });
  } catch (error) {
    console.error(error);
  }
};

export const chatErrorHandler = async (error: unknown) => {
  console.error('Bot error:', error instanceof Error ? error : new Error(String(error)));
};

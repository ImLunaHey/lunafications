import { bot } from '../bot.mts';
import { getMessages, getQueueNames, messagesToRichText } from '../queue.mts';

export const processQueue = async () => {
  const queues = getQueueNames();
  if (queues.length === 0) {
    setTimeout(processQueue, 30_000);
    return;
  }

  for (const queue of queues) {
    const messages = getMessages(queue);
    if (messages.length === 0) continue;
    console.info(`Sending ${messages.length} messages for queue ${queue}`);

    for (const message of messages) {
      try {
        const conversation = await bot.getConversationForMembers([queue]);
        await conversation.sendMessage({ text: await messagesToRichText([message]) });
      } catch (error) {
        console.error(`Failed to send message to ${queue}:`, error);
      }
    }
  }

  setTimeout(processQueue, 30_000);
};

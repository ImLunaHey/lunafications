import { bot } from '../bot.mts';
import { getMessages, getQueueNames, messagesToRichText } from '../queue.mts';
import { logger } from '../logger.mts';
import { TimeCache } from '../time-cache.mts';

const sentMessages = new TimeCache<boolean>(60 * 60 * 1000); // 1 hour TTL

export const processQueue = async () => {
  const queues = getQueueNames();
  if (queues.length === 0) {
    setTimeout(processQueue, 30_000);
    return;
  }

  for (const queue of queues) {
    const messages = getMessages(queue);
    if (messages.length === 0) continue;

    const uniqueMessages = messages.filter((message) => {
      let messageKey: string;
      switch (message.type) {
        case 'blocked':
          messageKey = `${queue}:${message.type}:${message.did}`;
          break;
        case 'list':
          messageKey = `${queue}:${message.type}:${message.did}:${message.list}`;
          break;
        case 'post':
          messageKey = `${queue}:${message.type}:${message.did}:${message.post}`;
          break;
      }

      if (sentMessages.get(messageKey)) {
        logger.debug(`Skipping duplicate message ${messageKey}`);
        return false;
      }
      return true;
    });

    if (uniqueMessages.length === 0) continue;
    logger.info(`Sending ${uniqueMessages.length} messages for queue ${queue}`);

    for (const message of uniqueMessages) {
      try {
        const conversation = await bot.getConversationForMembers([queue]);
        await conversation.sendMessage({ text: await messagesToRichText([message]) });

        // Mark message as sent
        let messageKey: string;
        switch (message.type) {
          case 'blocked':
            messageKey = `${queue}:${message.type}:${message.did}`;
            break;
          case 'list':
            messageKey = `${queue}:${message.type}:${message.did}:${message.list}`;
            break;
          case 'post':
            messageKey = `${queue}:${message.type}:${message.did}:${message.post}`;
            break;
        }
        sentMessages.set(messageKey, true);
      } catch (error) {
        logger.error(`Failed to send message to ${queue}:`, error);
      }
    }
  }

  setTimeout(processQueue, 30_000);
};

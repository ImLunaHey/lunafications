import { RichText } from '@skyware/bot';

const queue = new Map<string, Set<RichText>>();

export const getQueueNames = (): string[] => {
  return Array.from(queue.keys());
};

export const getMessages = (queueName: string): RichText[] => {
  const messages = queue.get(queueName) || [];
  queue.set(queueName, new Set());
  return [...messages.values()];
};

export const addMessage = (queueName: string, message: RichText) => {
  console.info(`Adding message to queue ${queueName}: ${message.text}`);
  const messages = queue.get(queueName) || new Set();
  messages.add(message);
  queue.set(queueName, messages);
};

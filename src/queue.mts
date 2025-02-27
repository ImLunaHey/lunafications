import { ListPurpose, RichText } from '@skyware/bot';
import { resolveDidToHandle, fetchListDetails } from './cache.mts';

type BlockedMessage = {
  /**
   * The type of message.
   */
  type: 'blocked';
  /**
   * The DID of the account that did the blocking.
   */
  did: `did:${string}`;
};

type ListMessage = {
  /**
   * The type of message.
   */
  type: 'list';
  /**
   * The list ID of the starter pack.
   */
  list: string;
  /**
   * The DID of the account that created the starter pack.
   */
  did: `did:${string}`;
};

type Message = BlockedMessage | ListMessage;

const resolveListPurposeToType = (purpose: ListPurpose): 'moderation list' | 'starter pack' | 'feed' => {
  switch (purpose) {
    case 'app.bsky.graph.defs#curatelist':
      return 'feed';
    case 'app.bsky.graph.defs#modlist':
      return 'moderation list';
    case 'app.bsky.graph.defs#referencelist':
      return 'starter pack';
    default:
      throw new Error(`Unknown list purpose: ${purpose}`);
  }
};

// @TODO: we need to make sure this doesnt go over the 10k character limit
export const messagesToRichText = async (messages: Message[]): Promise<RichText> => {
  const richText = new RichText();
  for (const message of messages) {
    const handle = await resolveDidToHandle(message.did);
    switch (message.type) {
      case 'blocked':
        richText.addText('\n').addText('You were blocked by ').addMention(handle, message.did);
        break;
      case 'list': {
        const list = await fetchListDetails(message.list);
        const listType = resolveListPurposeToType(list.purpose);

        richText
          .addText('\n')
          .addMention(handle, message.did)
          .addText(` has added you to the "`)
          .addLink(list.name, `https://bsky.app/profile/${message.did}/lists/${message.list}`)
          .addText(`" ${listType}.`);
        break;
      }
    }
  }
  return richText;
};

const queue = new Map<string, Set<Message>>();

export const getQueueNames = (): string[] => {
  return Array.from(queue.keys());
};

export const getMessages = (queueName: string): Message[] => {
  const messages = queue.get(queueName) || [];
  queue.set(queueName, new Set());
  return [...messages.values()];
};

export const addMessage = (queueName: string, message: Message) => {
  console.info(`Adding message to queue ${queueName}: ${message.type}`);
  const messages = queue.get(queueName) || new Set();
  messages.add(message);
  queue.set(queueName, messages);
};

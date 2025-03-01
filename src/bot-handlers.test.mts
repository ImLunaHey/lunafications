import { test, expect } from 'vitest';
import { chatMessageHandler } from './bot-handlers.mts';
import { ChatMessage } from '@skyware/bot';

test('chatMessageHandler', async () => {
  let reply = '';
  const mockedMessage = {
    getSender: async () => ({ handle: 'test' }),
    getConversation: async () => ({
      sendMessage: async (message: any) => {
        reply = message.text;
        return message;
      },
    }),
    text: 'menu',
  } as ChatMessage;

  await chatMessageHandler(mockedMessage);
  expect(reply).toBe(
    "Thanks for messaging me! I can notify you when you're blocked or added to lists.\n\n" +
      'Reply with one of the following options:\n' +
      "- 'notify blocks': Get notified when someone blocks you\n" +
      "- 'notify lists': Get notified when you're added to lists\n" +
      "- 'notify all': Get all notifications\n" +
      "- 'notify none': Turn off all notifications" +
      "- 'notify posts @imlunahey.com': Get notified when a specific user makes a post\n" +
      "- 'settings': View your current notification settings",
  );
});

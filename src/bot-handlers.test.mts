import { afterEach, expect, test, vi } from 'vitest';
import { chatErrorHandler, chatMessageHandler } from './bot-handlers.mts';
import { ChatMessage } from '@skyware/bot';
import { outdent } from 'outdent';

afterEach(() => {
  vi.restoreAllMocks();
});

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
  expect(reply).toBe(outdent`
    Thanks for messaging me! I can notify you when you're blocked or added to lists.

    Reply with one of the following options:
    - 'notify blocks': Get notified when someone blocks you
    - 'notify lists': Get notified when you're added to lists
    - 'notify all': Get all notifications
    - 'notify posts @imlunahey.com': Get notified when a specific user makes a post
    - 'hide blocks': Turn off block notifications
    - 'hide lists': Turn off list notifications
    - 'hide posts @imlunahey.com': Stop monitoring a specific user's posts
    - 'hide all': Turn off all notifications
    - 'settings': View your current notification settings
  `);
});

test('chatErrorHandler formats XRPC errors', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  await chatErrorHandler({
    status: 502,
    kind: 'UpstreamFailure',
    description: 'UpstreamFailure',
  });

  expect(consoleError).toHaveBeenCalledWith('Bot error: status 502 – UpstreamFailure – UpstreamFailure');
});

test('chatErrorHandler falls back to generic errors', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  await chatErrorHandler(new Error('Unexpected failure'));

  expect(consoleError).toHaveBeenCalledWith('Bot error: Unexpected failure');
});

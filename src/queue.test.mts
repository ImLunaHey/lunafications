import { expect, test, vi } from 'vitest';
import outdent from 'outdent';

vi.mock('./cache.mts', () => ({
  resolveDidToHandle: vi.fn(async (did: string) => {
    switch (did) {
      case 'did:plc:k6acu4chiwkixvdedcmdgmal':
        return 'imlunahey.com';
      case 'did:web:safety.lukeacl.com':
        return 'safety.lukeacl.com';
      default:
        return did;
    }
  }),
  fetchListDetails: vi.fn(async () => ({
    name: 'fake accounts',
    purpose: 'app.bsky.graph.defs#modlist',
  })),
}));

import { addMessage, getMessages, messagesToRichText } from './queue.mts';

test('converting messages to rich text', async () => {
  const richText = await messagesToRichText([
    {
      type: 'blocked',
      did: 'did:plc:k6acu4chiwkixvdedcmdgmal',
    },
    {
      type: 'blocked',
      did: 'did:plc:k6acu4chiwkixvdedcmdgmal',
    },
    {
      type: 'blocked',
      did: 'did:web:safety.lukeacl.com',
    },
    { type: 'list', did: 'did:plc:k6acu4chiwkixvdedcmdgmal', list: '3lh7m34kh672k' },
  ]).then((richText) => richText.text);

  expect(richText).toBe(outdent`
    You were blocked by imlunahey.com
    You were blocked by imlunahey.com
    You were blocked by safety.lukeacl.com
    imlunahey.com has added you to the "fake accounts" moderation list.
  `);
});

test('adding duplicate messages only keeps the latest instance', () => {
  const queueName = 'did:plc:a3awelxrffaersstz2u3ksjt';

  const firstMessage = {
    type: 'list' as const,
    did: 'did:plc:a3awelxrffaersstz2u3ksjt',
    list: '3lh7m34kh672k',
  };

  const secondMessage = {
    type: 'list' as const,
    did: 'did:plc:a3awelxrffaersstz2u3ksjt',
    list: '3lh7m34kh672k',
  };

  addMessage(queueName, firstMessage);
  addMessage(queueName, secondMessage);

  const messages = getMessages(queueName);

  expect(messages).toHaveLength(1);
  expect(messages[0]).toStrictEqual(secondMessage);
});

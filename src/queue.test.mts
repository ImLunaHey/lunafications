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

import { messagesToRichText, resolveMessageKey } from './queue.mts';

test('converting messages to rich text', async () => {
  const richText = await messagesToRichText([
    {
      type: 'blocked',
      did: 'did:plc:k6acu4chiwkixvdedcmdgmal',
      event: '1:block-1',
    },
    {
      type: 'blocked',
      did: 'did:plc:k6acu4chiwkixvdedcmdgmal',
      event: '2:block-2',
    },
    {
      type: 'blocked',
      did: 'did:web:safety.lukeacl.com',
      event: '3:block-3',
    },
    {
      type: 'list',
      did: 'did:plc:k6acu4chiwkixvdedcmdgmal',
      list: '3lh7m34kh672k',
      event: '4:item-1',
    },
  ]).then((richText) => richText.text);

  expect(richText).toBe(outdent`
    You were blocked by imlunahey.com
    You were blocked by imlunahey.com
    You were blocked by safety.lukeacl.com
    imlunahey.com has added you to the "fake accounts" moderation list.
  `);
});

test('message keys include the recipient and event identity', () => {
  expect(
    resolveMessageKey('did:plc:recipient', {
      type: 'list',
      did: 'did:plc:actor',
      list: 'same-rkey',
      event: '123:list-item-rkey',
    }),
  ).toBe('did:plc:recipient:list:did:plc:actor:123:list-item-rkey');
});

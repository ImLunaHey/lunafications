import { messagesToRichText } from './queue.mts';
import outdent from 'outdent';
import { test, expect } from 'vitest';

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

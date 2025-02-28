import { ChatMessage, Profile } from '@skyware/bot';
import { createReply } from './bot.mts';
import { test, expect } from 'vitest';
import { db, migrateToLatest } from './db/index.mts';

await migrateToLatest(db);

test('createReply (menu)', async () => {
  const sender = { did: '123' } as unknown as Profile;
  const message = { text: 'menu' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
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

test('createReply (notify posts @imlunahey.com)', async () => {
  const sender = { did: '123' } as unknown as Profile;
  const message = { text: 'notify posts @imlunakey.com' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You will be notified when @imlunakey.com makes a post.`);
});

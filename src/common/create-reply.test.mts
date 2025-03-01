import { ChatMessage, Profile } from '@skyware/bot';
import { createReply } from './create-reply.mts';
import { test, expect } from 'vitest';
import { db, migrateToLatest } from '../db/index.mts';

await migrateToLatest(db);

const did = 'did:plc:k6acu4chiwkixvdedcmdgmal';

test('createReply (menu)', async () => {
  const sender = { did } as unknown as Profile;
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

test('createReply (notify blocks)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'notify blocks' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You'll now receive notifications when someone blocks you.`);
});

test('createReply (notify lists)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'notify lists' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You'll now receive notifications when you're added to lists.`);
});

test('createReply (notify all)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'notify all' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You'll now receive all notifications.`);
});

test('createReply (notify none)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'notify none' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You'll no longer receive any notifications.`);
});

test('createReply (notify none)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'notify none' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You'll no longer receive any notifications.`);
});

test('createReply (settings)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'settings' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe('Your current settings:\n- Notify blocks: off\n- Notify lists: off');
});

test('createReply (notify posts @imlunahey.com)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'notify posts @imlunakey.com' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You will be notified when @imlunakey.com makes a post.`);
});

test('createReply (default reply)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'invalid text' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe('I did not understand that. Please reply with "menu" to see the available options.');
});

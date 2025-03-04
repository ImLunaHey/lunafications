import { ChatMessage, Profile } from '@skyware/bot';
import { createReply } from './create-reply.mts';
import { test, expect } from 'vitest';
import { db, migrateToLatest } from '../db/index.mts';
import { outdent } from 'outdent';

await migrateToLatest(db);

const did = 'did:plc:k6acu4chiwkixvdedcmdgmal';

test('createReply (menu)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'menu' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
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

test('createReply (hide all)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'hide all' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You'll no longer receive any notifications.`);
});

test('createReply (settings)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'settings' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(outdent`
    Your current settings:
    - Notify blocks: off
    - Notify lists: off
    - Notify posts: none
  `);
});

test('createReply (notify posts @imlunahey.com)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'notify posts @imlunahey.com' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`You will be notified when @imlunahey.com makes a post.`);
});

test('createReply (notify posts @i-am-an-invalid-domain.tld)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'notify posts @i-am-an-invalid-domain.tld' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe(`Could not find a user with the handle @i-am-an-invalid-domain.tld.`);
});

test('createReply (default reply)', async () => {
  const sender = { did } as unknown as Profile;
  const message = { text: 'invalid text' } as unknown as ChatMessage;
  const reply = await createReply(sender, message);
  expect(reply).toBe('I did not understand that. Please reply with "menu" to see the available options.');
});

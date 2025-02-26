import 'dotenv/config';
import { IncomingChatPreference } from '@skyware/bot';
import { bot } from './bot.mts';
import { getMessages, getQueueNames } from './queue.mts';
import { jetstream } from './jetstream.mts';
import { db, migrateToLatest } from './db/index.mts';

const username = process.env.BSKY_USERNAME;
const password = process.env.BSKY_PASSWORD;

const processQueue = async () => {
  const queues = getQueueNames();

  for (const queue of queues) {
    const messages = getMessages(queue);
    if (messages.length === 0) continue;
    console.info(`Sending ${messages.length} messages for queue ${queue}`);

    for (const message of messages) {
      try {
        const conversation = await bot.getConversationForMembers([queue]);
        await conversation.sendMessage({ text: message });
      } catch (error) {
        console.error(`Failed to send message to ${queue}:`, error);
      }
    }
  }

  setTimeout(processQueue, 30_000);
};

const main = async () => {
  if (!username || !password) {
    console.error('Please provide a username and password in the environment variables BSKY_USERNAME and BSKY_PASSWORD.');
    process.exit(1);
  }

  await migrateToLatest(db);

  await bot.login({
    identifier: username,
    password,
  });

  console.info(`Logged in as ${username}`);

  await bot.setChatPreference(IncomingChatPreference.All);

  console.info('Listening for messages...');

  jetstream.start();

  setTimeout(processQueue, 30_000);
};

main().catch(console.error);

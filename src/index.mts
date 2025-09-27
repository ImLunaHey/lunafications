import 'dotenv/config';
import { IncomingChatPreference } from '@skyware/bot';
import { bot } from './bot.mts';
import { jetstream } from './jetstream.mts';
import { db, migrateToLatest } from './db/index.mts';
import { processQueue } from './common/process-queue.mts';
import { updateBio } from './common/update-bio.mts';
import { logger } from './logger.mts';

const username = process.env.BSKY_USERNAME;
const password = process.env.BSKY_PASSWORD;

const THIRTY_SECONDS = 30_000;
const TEN_MINUTES = 600_000;

const main = async () => {
  if (!username || !password) {
    logger.error('Please provide a username and password in the environment variables BSKY_USERNAME and BSKY_PASSWORD.');
    process.exit(1);
  }

  await migrateToLatest(db);

  await bot.login({
    identifier: username,
    password,
  });

  logger.info(`Logged in as ${username}`);

  await bot.setChatPreference(IncomingChatPreference.All);

  logger.info('Listening for messages...');

  jetstream.start();

  setTimeout(processQueue, THIRTY_SECONDS);
  setTimeout(updateBio, TEN_MINUTES);
};

main().catch((error) => {
  logger.error(error);
});

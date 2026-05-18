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

const findRateLimitCause = (error: unknown): { headers: Record<string, string> } | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < 10 && current; depth++) {
    if (!current || typeof current !== 'object') return undefined;
    const candidate = current as { status?: unknown; headers?: unknown; cause?: unknown };
    if (candidate.status === 429 && candidate.headers && typeof candidate.headers === 'object') {
      return { headers: candidate.headers as Record<string, string> };
    }
    current = candidate.cause;
  }
  return undefined;
};

const loginWithRateLimitRetry = async (identifier: string, secret: string, maxAttempts = 3): Promise<void> => {
  const MAX_WAIT_MS = 25 * 60 * 60 * 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await bot.login({ identifier, password: secret });
      return;
    } catch (error) {
      const rateLimit = findRateLimitCause(error);
      if (!rateLimit || attempt === maxAttempts) throw error;

      const resetSeconds = Number(rateLimit.headers['ratelimit-reset']);
      const bufferMs = 5_000;
      const waitMs = Number.isFinite(resetSeconds)
        ? Math.min(Math.max(resetSeconds * 1000 - Date.now(), 0) + bufferMs, MAX_WAIT_MS)
        : 60_000;
      const resetIso = Number.isFinite(resetSeconds) ? new Date(resetSeconds * 1000).toISOString() : 'unknown';

      logger.warn('Login rate limited, sleeping until reset', {
        attempt,
        maxAttempts,
        waitSeconds: Math.round(waitMs / 1000),
        resetAt: resetIso,
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
};

const main = async () => {
  if (!username || !password) {
    logger.error('Please provide a username and password in the environment variables BSKY_USERNAME and BSKY_PASSWORD.');
    process.exit(1);
  }

  logger.info('Attempting to login', { username });

  await migrateToLatest(db);

  await loginWithRateLimitRetry(username, password);

  logger.info('Logged in', { username });

  await bot.setChatPreference(IncomingChatPreference.All);

  logger.info('Listening for messages...');

  jetstream.start();

  setTimeout(processQueue, THIRTY_SECONDS);
  setTimeout(updateBio, TEN_MINUTES);
};

main().catch((error) => {
  logger.error(error);
});

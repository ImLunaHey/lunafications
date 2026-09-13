import { outdent } from 'outdent';
import { db } from '../db/index.mts';
import { bot } from '../bot.mts';
import { logger } from '../logger.mts';

const TEN_MINUTES = 600_000;
const COLLECTION = 'app.bsky.actor.profile';
const RKEY = 'self';

export const getUserCount = async () => {
  const [settings, postNotifications] = await Promise.all([
    db.selectFrom('settings').select(['did', 'blocks', 'lists']).execute(),
    db.selectFrom('post_notifications').select('did').distinct().execute(),
  ]);
  return new Set([
    ...settings.filter((setting) => setting.blocks === 1 || setting.lists === 1).map((setting) => setting.did),
    ...postNotifications.map((notification) => notification.did),
  ]).size;
};

export const updateBio = async () => {
  const repo = bot.profile.did;
  const existing = await bot.agent
    .get('com.atproto.repo.getRecord', { params: { repo, collection: COLLECTION, rkey: RKEY } })
    .catch(() => undefined);
  const count = await getUserCount();
  const existingRecord = (existing?.data.value ?? {}) as Record<string, unknown>;

  await bot.agent.call('com.atproto.repo.putRecord', {
    data: {
      repo,
      collection: COLLECTION,
      rkey: RKEY,
      record: {
        ...existingRecord,
        $type: COLLECTION,
        description: outdent`
          send me a DM with "menu" to start

          created by @imlunahey.com

          profile image and banner by @ex.trathi.cc

          you can self host this if you'd like github.com/ImLunaHey/lunafications

          serving ${count} users
        `,
      },
      ...(existing?.data.cid ? { swapRecord: existing.data.cid } : {}),
    },
  });
};

export const startBioUpdater = (intervalMs = TEN_MINUTES) => {
  const run = async () => {
    try {
      await updateBio();
    } catch (error) {
      logger.error('Failed to update profile bio', error);
    } finally {
      setTimeout(run, intervalMs);
    }
  };
  setTimeout(run, intervalMs);
};

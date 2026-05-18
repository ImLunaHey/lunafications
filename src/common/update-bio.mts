import { outdent } from 'outdent';
import { db } from '../db/index.mts';
import { bot } from '../bot.mts';

const TEN_MINUTES = 600_000;
const COLLECTION = 'app.bsky.actor.profile';
const RKEY = 'self';

export const updateBio = async () => {
  const repo = bot.profile.did;

  const existing = await bot.agent
    .get('com.atproto.repo.getRecord', { params: { repo, collection: COLLECTION, rkey: RKEY } })
    .catch(() => undefined);

  const { count } = await db
    .selectFrom('settings')
    .select(db.fn.countAll().as('count'))
    .executeTakeFirstOrThrow();

  const existingRecord = (existing?.data.value ?? {}) as Record<string, unknown>;

  const record = {
    ...existingRecord,
    $type: COLLECTION,
    description: outdent`
        send me a DM with "menu" to start

        created by @imlunahey.com

        profile image and banner by @ex.trathi.cc

        you can self host this if you'd like github.com/ImLunaHey/lunafications

        serving ${count} users
    `,
  };

  await bot.agent.call('com.atproto.repo.putRecord', {
    data: {
      repo,
      collection: COLLECTION,
      rkey: RKEY,
      record,
      ...(existing?.data.cid ? { swapRecord: existing.data.cid } : {}),
    },
  });

  setTimeout(updateBio, TEN_MINUTES);
};

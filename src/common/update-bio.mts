import outdent from 'outdent';
import { db } from '../db/index.mts';
import { authedAgent } from './agents.mts';

export const updateBio = async () => {
  await authedAgent.upsertProfile(async (existingProfile) => {
    const existing = existingProfile!;
    const { count } = await db.selectFrom('settings').select(db.fn.countAll().as('count')).executeTakeFirstOrThrow();

    existing.description = outdent`
        send me a DM with "menu" to start
        
        created by @imlunahey.com
        
        profile image and banner by @ex.trathi.cc
        
        you can self host this if you'd like github.com/ImLunaHey/lunafications

        serving ${count} users
    `;

    return existing;
  });
};

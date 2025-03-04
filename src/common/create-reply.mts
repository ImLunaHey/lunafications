import { Profile, ChatMessage } from '@skyware/bot';
import { db } from '../db/index.mts';
import { resolveHandleToDid } from '../cache.mts';
import { outdent } from 'outdent';

function bigIntReplacer(_key: string, value: any): any {
  return typeof value === 'bigint' ? value.toString() : value;
}

export const createReply = async (sender: Profile, message: ChatMessage) => {
  const [command = '', subCommand = '', ...props] = message.text.toLowerCase().split(' ');
  const fullCommand = `${command} ${subCommand}`.trim();
  switch (fullCommand) {
    case 'menu': {
      return outdent`
        Thanks for messaging me! I can notify you when you're blocked or added to lists.

        Reply with one of the following options:
        - 'notify blocks': Get notified when someone blocks you
        - 'notify lists': Get notified when you're added to lists
        - 'notify all': Get all notifications
        - 'notify none': Turn off all notifications
        - 'notify posts @imlunahey.com': Get notified when a specific user makes a post
        - 'settings': View your current notification settings
      `;
    }
    case 'notify blocks': {
      const result = await db
        .insertInto('settings')
        .values({ did: sender.did, blocks: 1, lists: 0 })
        .onConflict((builder) => builder.doUpdateSet({ blocks: 1 }))
        .executeTakeFirst();
      console.info(`Updated settings for ${sender.did}: ${JSON.stringify(result, bigIntReplacer)}`);
      return "You'll now receive notifications when someone blocks you.";
    }
    case 'notify lists': {
      const result = await db
        .insertInto('settings')
        .values({ did: sender.did, blocks: 0, lists: 1 })
        .onConflict((builder) => builder.doUpdateSet({ lists: 1 }))
        .executeTakeFirst();
      console.info(`Updated settings for ${sender.did}: ${JSON.stringify(result, bigIntReplacer)}`);
      return "You'll now receive notifications when you're added to lists.";
    }
    case 'notify all': {
      const result = await db
        .insertInto('settings')
        .values({ did: sender.did, blocks: 1, lists: 1 })
        .onConflict((builder) => builder.doUpdateSet({ blocks: 1, lists: 1 }))
        .executeTakeFirst();
      console.info(`Updated settings for ${sender.did}: ${JSON.stringify(result, bigIntReplacer)}`);
      return "You'll now receive all notifications.";
    }
    case 'notify posts': {
      const [handle = ''] = props;
      if (!handle) return 'Please provide a handle you want to monitor, e.g. "notify posts @imlunakey.com".';

      const from = await resolveHandleToDid(handle);
      if (!from) return `Could not find a user with the handle ${handle}.`;

      const result = await db
        .insertInto('post_notifications')
        .values({ did: sender.did, from: from })
        .onConflict((builder) => builder.doUpdateSet({ from: from }))
        .executeTakeFirst();

      console.info(`Updated post notifications for ${sender.did}: ${JSON.stringify(result, bigIntReplacer)}`);
      return `You will be notified when ${handle} makes a post.`;
    }
    case 'hide blocks': {
      const result = await db.updateTable('settings').set({ blocks: 0 }).where('did', '=', sender.did).executeTakeFirst();
      console.info(`Deleted settings for ${sender.did}: ${JSON.stringify(result, bigIntReplacer)}`);
      return "You'll no longer receive block notifications.";
    }
    case 'hide lists': {
      const result = await db.updateTable('settings').set({ lists: 0 }).where('did', '=', sender.did).executeTakeFirst();
      console.info(`Deleted settings for ${sender.did}: ${JSON.stringify(result, bigIntReplacer)}`);
      return "You'll no longer receive list notifications.";
    }
    case 'hide posts': {
      const [handle = ''] = props;
      if (!handle) return 'Please provide a handle you want to stop monitoring, e.g. "disable posts @imlunakey.com".';

      const from = await resolveHandleToDid(handle);
      if (!from) return `Could not find a user with the handle ${handle}.`;

      const result = await db
        .deleteFrom('post_notifications')
        .where('did', '=', sender.did)
        .where('from', '=', from)
        .executeTakeFirst();
      console.info(`Deleted post notifications for ${sender.did}: ${JSON.stringify(result, bigIntReplacer)}`);
      return `You will no longer be notified when ${handle} makes a post.`;
    }
    case 'hide all': {
      const result = await db.deleteFrom('settings').where('did', '=', sender.did).executeTakeFirst();
      console.info(`Updated settings for ${sender.did}: ${JSON.stringify(result, bigIntReplacer)}`);
      return "You'll no longer receive any notifications.";
    }
    case 'settings': {
      const settings = await db.selectFrom('settings').selectAll().where('did', '=', sender.did).executeTakeFirst();
      console.info(`Got settings for ${sender.did}: ${JSON.stringify(settings, bigIntReplacer)}`);
      return `Your current settings:\n- Notify blocks: ${settings?.blocks === 1 ? 'on' : 'off'}\n- Notify lists: ${
        settings?.lists === 1 ? 'on' : 'off'
      }`;
    }
    default: {
      return 'I did not understand that. Please reply with "menu" to see the available options.';
    }
  }
};

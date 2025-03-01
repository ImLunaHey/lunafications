import { Bot } from '@skyware/bot';
import { chatMessageHandler, chatErrorHandler } from './bot-handlers.mts';

export const bot = new Bot({ emitChatEvents: true });

bot.on('message', chatMessageHandler);
bot.on('error', chatErrorHandler);

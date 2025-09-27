import { Jetstream } from '@skyware/jetstream';
import { jetstreamBlockHandler, jetstreamListItemHandler, jetstreamFeedPostHandler } from './jetstream-handlers.mts';

export const jetstream = new Jetstream({
  wantedCollections: ['app.bsky.graph.block', 'app.bsky.graph.listitem', 'app.bsky.feed.post'],
});

const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

const clearScheduledReconnect = () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = undefined;
  }
};

const scheduleReconnect = () => {
  if (reconnectTimeout) return;

  const delay = Math.min(
    BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts,
    MAX_RECONNECT_DELAY_MS,
  );
  reconnectAttempts += 1;

  console.warn(`Jetstream connection lost. Reconnecting in ${delay}ms.`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = undefined;
    jetstream.start();
  }, delay);
};

jetstream.on('app.bsky.graph.block', jetstreamBlockHandler);

jetstream.on('app.bsky.graph.listitem', jetstreamListItemHandler);

jetstream.on('app.bsky.feed.post', jetstreamFeedPostHandler);

jetstream.on('open', () => {
  reconnectAttempts = 0;
  clearScheduledReconnect();
});

jetstream.on('close', scheduleReconnect);

jetstream.on('error', (error: unknown) => {
  console.error('Jetstream encountered an error. Attempting to reconnect.', error);
  jetstream.close();
  scheduleReconnect();
});

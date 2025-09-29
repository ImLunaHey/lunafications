import { Jetstream } from '@skyware/jetstream';
import { jetstreamBlockHandler, jetstreamListItemHandler, jetstreamFeedPostHandler } from './jetstream-handlers.mts';

let cursor: number | undefined = 0;

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

  const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  reconnectAttempts += 1;

  console.warn(`Jetstream connection lost. Reconnecting in ${delay}ms.`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = undefined;
    jetstream.start();
  }, delay);
};

jetstream.on('commit', (commit) => {
  cursor = commit.time_us;
});

jetstream.on('app.bsky.graph.block', (event) => {
  // skip events before the cursor
  if (cursor && event.time_us < cursor) return;
  jetstreamBlockHandler(event);
});

jetstream.on('app.bsky.graph.listitem', (event) => {
  // skip events before the cursor
  if (cursor && event.time_us < cursor) return;
  jetstreamListItemHandler(event);
});

jetstream.on('app.bsky.feed.post', (event) => {
  // skip events before the cursor
  if (cursor && event.time_us < cursor) return;
  jetstreamFeedPostHandler(event);
});

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

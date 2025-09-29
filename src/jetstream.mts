import { Jetstream } from '@skyware/jetstream';
import { jetstreamBlockHandler, jetstreamListItemHandler, jetstreamFeedPostHandler } from './jetstream-handlers.mts';

let cursor: number | undefined = 0;

export const jetstream = new Jetstream({
  wantedCollections: ['app.bsky.graph.block', 'app.bsky.graph.listitem', 'app.bsky.feed.post'],
});

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

jetstream.on('error', (error: unknown) => {
  console.error('Jetstream encountered an error. Attempting to reconnect.', error);
});

import { Jetstream } from '@skyware/jetstream';
import { jetstreamBlockHandler, jetstreamListItemHandler, jetstreamFeedPostHandler } from './jetstream-handlers.mts';

export const jetstream = new Jetstream({
  wantedCollections: ['app.bsky.graph.block', 'app.bsky.graph.listitem', 'app.bsky.feed.post'],
});

jetstream.on('app.bsky.graph.block', jetstreamBlockHandler);

jetstream.on('app.bsky.graph.listitem', jetstreamListItemHandler);

jetstream.on('app.bsky.feed.post', jetstreamFeedPostHandler);

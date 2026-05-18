import { BskyAgent } from '@atproto/api';

export const publicAgent = new BskyAgent({
  service: 'https://public.api.bsky.app',
});

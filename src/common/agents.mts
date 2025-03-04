import { BskyAgent } from '@atproto/api';

export const publicAgent = new BskyAgent({
  service: 'https://public.api.bsky.app',
});

export const authedAgent = new BskyAgent({
  service: 'https://api.bsky.app',
});

void authedAgent.login({
  identifier: process.env.BSKY_USERNAME!,
  password: process.env.BSKY_PASSWORD!,
});

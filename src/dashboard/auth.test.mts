import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { JoseKey } from '@atproto/jwk-jose';
import { createDb, migrateToLatest, type Database } from '../db/index.mts';
import {
  createDashboardOAuthClient,
  createDashboardSession,
  deleteDashboardSession,
  secureEqual,
  validateDashboardSession,
  type DashboardConfig,
} from './auth.mts';

let database: Database;
const config: DashboardConfig = {
  publicUrl: 'https://dashboard.example.com',
  adminDid: 'did:plc:admin',
  adminHandle: 'admin.example.com',
  sessionSecret: 'a'.repeat(32),
  oauthPrivateKey: '',
};

beforeEach(async () => {
  database = createDb(':memory:');
  await migrateToLatest(database);
});
afterEach(async () => database.destroy());

describe('dashboard sessions', () => {
  test('accepts the issued token until its 12-hour expiry', async () => {
    const now = 1_000;
    const token = await createDashboardSession(database, config, now);
    expect(await validateDashboardSession(database, config, token, now)).toBe(true);
    expect(await validateDashboardSession(database, config, token, now + 12 * 60 * 60 * 1000)).toBe(false);
  });

  test('rejects missing, altered, deleted, or differently keyed tokens', async () => {
    const token = await createDashboardSession(database, config, 1_000);
    expect(await validateDashboardSession(database, config, undefined, 1_001)).toBe(false);
    expect(await validateDashboardSession(database, config, `${token}x`, 1_001)).toBe(false);
    expect(await validateDashboardSession(database, { ...config, sessionSecret: 'b'.repeat(32) }, token, 1_001)).toBe(false);
    await deleteDashboardSession(database, config, token);
    expect(await validateDashboardSession(database, config, token, 1_001)).toBe(false);
  });
});

test('publishes OAuth metadata and a public-only JWKS', async () => {
  const key = await JoseKey.generate(['ES256'], 'dashboard-oauth');
  const { client } = await createDashboardOAuthClient(database, {
    ...config,
    oauthPrivateKey: JSON.stringify(key.privateJwk),
  });
  expect(client.clientMetadata).toMatchObject({
    client_id: 'https://dashboard.example.com/oauth/client-metadata.json',
    redirect_uris: ['https://dashboard.example.com/oauth/callback'],
    scope: 'atproto',
    token_endpoint_auth_method: 'private_key_jwt',
  });
  expect(JSON.stringify(client.jwks)).not.toContain('"d"');
});

test('compares non-empty OAuth state values safely', () => {
  expect(secureEqual('same', 'same')).toBe(true);
  expect(secureEqual('same', 'different')).toBe(false);
  expect(secureEqual(undefined, 'same')).toBe(false);
  expect(secureEqual('', '')).toBe(false);
});

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { JoseKey } from '@atproto/jwk-jose';
import {
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState,
  type NodeSavedSessionStore,
  type NodeSavedStateStore,
} from '@atproto/oauth-client-node';
import type { Database } from '../db/index.mts';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DASHBOARD_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type DashboardConfig = {
  publicUrl: string;
  adminDid: string;
  adminHandle: string;
  sessionSecret: string;
  oauthPrivateKey: string;
};

const jsonStore = <T,>(database: Database, table: 'oauth_state' | 'oauth_session', ttlMs: number | null) => ({
  async set(key: string, value: T) {
    const expiresAt = ttlMs === null ? null : Date.now() + ttlMs;
    await database
      .insertInto(table)
      .values({ key, value: JSON.stringify(value), expires_at: expiresAt })
      .onConflict((conflict) =>
        conflict.column('key').doUpdateSet({ value: JSON.stringify(value), expires_at: expiresAt }),
      )
      .execute();
  },
  async get(key: string): Promise<T | undefined> {
    const row = await database.selectFrom(table).selectAll().where('key', '=', key).executeTakeFirst();
    if (!row) return undefined;
    if (row.expires_at !== null && row.expires_at <= Date.now()) {
      await database.deleteFrom(table).where('key', '=', key).execute();
      return undefined;
    }
    return JSON.parse(row.value) as T;
  },
  async del(key: string) {
    await database.deleteFrom(table).where('key', '=', key).execute();
  },
});

export const createDashboardOAuthClient = async (database: Database, config: DashboardConfig) => {
  const key = await JoseKey.fromImportable(config.oauthPrivateKey, 'dashboard-oauth');
  const signingAlgorithm = key.algorithms[0];
  if (!signingAlgorithm) throw new Error('Dashboard OAuth key has no supported signing algorithm');
  const stateStore = jsonStore<NodeSavedState>(database, 'oauth_state', OAUTH_STATE_TTL_MS) as NodeSavedStateStore;
  const sessionStore = jsonStore<NodeSavedSession>(database, 'oauth_session', null) as NodeSavedSessionStore;
  const client = new NodeOAuthClient({
    clientMetadata: {
      client_id: `${config.publicUrl}/oauth/client-metadata.json`,
      client_name: 'Lunafications Admin',
      client_uri: config.publicUrl,
      redirect_uris: [`${config.publicUrl}/oauth/callback`],
      grant_types: ['authorization_code', 'refresh_token'],
      scope: 'atproto',
      response_types: ['code'],
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: signingAlgorithm,
      dpop_bound_access_tokens: true,
      jwks_uri: `${config.publicUrl}/oauth/jwks.json`,
    },
    keyset: [key],
    stateStore,
    sessionStore,
  });
  return { client, sessionStore };
};

const tokenHash = (token: string, secret: string) => createHmac('sha256', secret).update(token).digest('hex');

export const createDashboardSession = async (database: Database, config: DashboardConfig, now = Date.now()) => {
  const token = randomBytes(32).toString('base64url');
  await database
    .insertInto('dashboard_sessions')
    .values({
      token_hash: tokenHash(token, config.sessionSecret),
      did: config.adminDid,
      created_at: now,
      expires_at: now + DASHBOARD_SESSION_TTL_MS,
    })
    .execute();
  return token;
};

export const validateDashboardSession = async (
  database: Database,
  config: DashboardConfig,
  token: string | undefined,
  now = Date.now(),
) => {
  if (!token) return false;
  await database.deleteFrom('dashboard_sessions').where('expires_at', '<=', now).execute();
  const row = await database
    .selectFrom('dashboard_sessions')
    .select(['did', 'expires_at'])
    .where('token_hash', '=', tokenHash(token, config.sessionSecret))
    .executeTakeFirst();
  return row?.did === config.adminDid && row.expires_at > now;
};

export const deleteDashboardSession = async (database: Database, config: DashboardConfig, token?: string) => {
  if (!token) return;
  await database
    .deleteFrom('dashboard_sessions')
    .where('token_hash', '=', tokenHash(token, config.sessionSecret))
    .execute();
};

export const secureEqual = (left: string | null | undefined, right: string | null | undefined) => {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

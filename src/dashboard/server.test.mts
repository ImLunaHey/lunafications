import type { AddressInfo } from 'node:net';
import { JoseKey } from '@atproto/jwk-jose';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDb, migrateToLatest, type Database } from '../db/index.mts';
import { createDashboardSession } from './auth.mts';
import { dashboardConfigFromEnv, startDashboardServer } from './server.mts';

let database: Database;
beforeEach(async () => {
  database = createDb(':memory:');
  await migrateToLatest(database);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await database.destroy();
});

const listen = async () => {
  const server = await startDashboardServer(database, 0);
  const port = (server.address() as AddressInfo).port;
  return { server, origin: `http://127.0.0.1:${port}` };
};

describe('dashboard configuration', () => {
  test('is disabled unless both secrets and a public domain exist', () => {
    vi.stubEnv('DASHBOARD_PUBLIC_URL', '');
    vi.stubEnv('RAILWAY_PUBLIC_DOMAIN', '');
    vi.stubEnv('DASHBOARD_SESSION_SECRET', '');
    vi.stubEnv('DASHBOARD_OAUTH_PRIVATE_KEY', '');
    expect(dashboardConfigFromEnv()).toBeNull();
  });

  test('derives its HTTPS origin from Railway and pins the administrator DID', () => {
    vi.stubEnv('DASHBOARD_PUBLIC_URL', '');
    vi.stubEnv('RAILWAY_PUBLIC_DOMAIN', 'lunafications-production.up.railway.app');
    vi.stubEnv('DASHBOARD_SESSION_SECRET', 's'.repeat(32));
    vi.stubEnv('DASHBOARD_OAUTH_PRIVATE_KEY', '{}');
    expect(dashboardConfigFromEnv()).toMatchObject({
      publicUrl: 'https://lunafications-production.up.railway.app',
      adminDid: 'did:plc:k6acu4chiwkixvdedcmdgmal',
      adminHandle: 'imlunahey.com',
    });
  });

  test('rejects non-local HTTP and weak session secrets', () => {
    vi.stubEnv('DASHBOARD_PUBLIC_URL', 'http://example.com');
    vi.stubEnv('DASHBOARD_SESSION_SECRET', 's'.repeat(32));
    vi.stubEnv('DASHBOARD_OAUTH_PRIVATE_KEY', '{}');
    expect(() => dashboardConfigFromEnv()).toThrow('HTTPS');
    vi.stubEnv('DASHBOARD_PUBLIC_URL', 'https://example.com');
    vi.stubEnv('DASHBOARD_SESSION_SECRET', 'short');
    expect(() => dashboardConfigFromEnv()).toThrow('32 characters');
  });
});

test('keeps health public but fails closed when dashboard secrets are absent', async () => {
  vi.stubEnv('DASHBOARD_PUBLIC_URL', '');
  vi.stubEnv('RAILWAY_PUBLIC_DOMAIN', '');
  vi.stubEnv('DASHBOARD_SESSION_SECRET', '');
  vi.stubEnv('DASHBOARD_OAUTH_PRIVATE_KEY', '');
  const { server, origin } = await listen();
  try {
    const health = await fetch(`${origin}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    const dashboard = await fetch(origin);
    expect(dashboard.status).toBe(503);
    expect(dashboard.headers.get('x-frame-options')).toBe('DENY');
  } finally {
    server.close();
  }
});

test('protects status while exposing safe OAuth discovery documents', async () => {
  const key = await JoseKey.generate(['ES256'], 'dashboard-oauth');
  vi.stubEnv('DASHBOARD_PUBLIC_URL', 'https://dashboard.example.com');
  vi.stubEnv('DASHBOARD_SESSION_SECRET', 's'.repeat(32));
  vi.stubEnv('DASHBOARD_OAUTH_PRIVATE_KEY', JSON.stringify(key.privateJwk));
  const config = dashboardConfigFromEnv();
  expect(config).not.toBeNull();
  const { server, origin } = await listen();
  try {
    expect((await fetch(`${origin}/api/status`)).status).toBe(401);
    const metadata = await (await fetch(`${origin}/oauth/client-metadata.json`)).json();
    expect(metadata.client_id).toBe('https://dashboard.example.com/oauth/client-metadata.json');
    const jwks = await (await fetch(`${origin}/oauth/jwks.json`)).text();
    expect(jwks).not.toContain('"d"');

    const token = await createDashboardSession(database, config!);
    const status = await fetch(`${origin}/api/status`, {
      headers: { cookie: `__Host-lunafications_admin=${token}` },
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toHaveProperty('queue.pending', 0);
    expect((await fetch(`${origin}/oauth/callback?state=bad`)).status).toBe(403);
  } finally {
    server.close();
  }
});

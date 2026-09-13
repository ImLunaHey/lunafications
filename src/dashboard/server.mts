import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { Database } from '../db/index.mts';
import { logger } from '../logger.mts';
import {
  createDashboardOAuthClient,
  createDashboardSession,
  deleteDashboardSession,
  secureEqual,
  validateDashboardSession,
  type DashboardConfig,
} from './auth.mts';
import { getDashboardStatus } from './status.mts';
import { dashboardPage, loginPage } from './page.mts';

const ADMIN_DID = 'did:plc:k6acu4chiwkixvdedcmdgmal';
const ADMIN_HANDLE = 'imlunahey.com';
const SESSION_COOKIE = '__Host-lunafications_admin';
const STATE_COOKIE = '__Host-lunafications_oauth_state';

const cookies = (request: IncomingMessage) =>
  Object.fromEntries(
    (request.headers.cookie ?? '').split(';').flatMap((part) => {
      const index = part.indexOf('=');
      return index < 0 ? [] : [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]];
    }),
  );

const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

const securityHeaders = {
  'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'cache-control': 'no-store',
};

const send = (response: ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8') => {
  response.writeHead(status, { ...securityHeaders, 'content-type': type });
  response.end(body);
};

const bearerToken = (request: IncomingMessage) => {
  const authorization = request.headers.authorization;
  return authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
};

const serveShadowState = async (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  database: Database,
) => {
  const token = process.env.SHADOW_API_TOKEN;
  if (!token || token.length < 32) return send(response, 404, 'Not found');
  if (!secureEqual(bearerToken(request), token)) {
    return send(response, 401, JSON.stringify({ error: 'Unauthorized' }), 'application/json');
  }
  if (request.method !== 'GET') return send(response, 405, 'Method not allowed');

  if (url.pathname === '/internal/shadow/snapshot') {
    const [settings, postNotifications] = await Promise.all([
      database.selectFrom('settings').selectAll().execute(),
      database.selectFrom('post_notifications').selectAll().execute(),
    ]);
    return send(response, 200, JSON.stringify({ settings, postNotifications }), 'application/json');
  }

  return send(response, 404, 'Not found');
};
const redirect = (response: ServerResponse, location: string, setCookie?: string | string[]) => {
  response.writeHead(303, { ...securityHeaders, location, ...(setCookie ? { 'set-cookie': setCookie } : {}) });
  response.end();
};

export const dashboardConfigFromEnv = (): DashboardConfig | null => {
  const domain = process.env.DASHBOARD_PUBLIC_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
  const sessionSecret = process.env.DASHBOARD_SESSION_SECRET;
  const oauthPrivateKey = process.env.DASHBOARD_OAUTH_PRIVATE_KEY;
  if (!domain || !sessionSecret || !oauthPrivateKey) return null;
  const publicUrl = new URL(domain).origin;
  if (publicUrl.startsWith('http:') && !publicUrl.startsWith('http://localhost')) {
    throw new Error('Dashboard public URL must use HTTPS');
  }
  if (sessionSecret.length < 32) throw new Error('DASHBOARD_SESSION_SECRET must contain at least 32 characters');
  return { publicUrl, adminDid: ADMIN_DID, adminHandle: ADMIN_HANDLE, sessionSecret, oauthPrivateKey };
};

export const startDashboardServer = async (database: Database, port = Number(process.env.PORT ?? 3000)) => {
  const config = dashboardConfigFromEnv();
  const oauth = config ? await createDashboardOAuthClient(database, config) : null;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', config?.publicUrl ?? 'http://localhost');
      if (url.pathname === '/health') return send(response, 200, JSON.stringify({ ok: true }), 'application/json');
      if (url.pathname.startsWith('/internal/shadow/')) {
        return await serveShadowState(request, response, url, database);
      }
      if (!config || !oauth) return send(response, 503, 'Dashboard is disabled because its secrets are not configured.');

      if (url.pathname === '/oauth/client-metadata.json') {
        if (request.method !== 'GET') return send(response, 405, 'Method not allowed');
        return send(response, 200, JSON.stringify(oauth.client.clientMetadata), 'application/json');
      }
      if (url.pathname === '/oauth/jwks.json') {
        if (request.method !== 'GET') return send(response, 405, 'Method not allowed');
        return send(response, 200, JSON.stringify(oauth.client.jwks), 'application/json');
      }
      if (url.pathname === '/oauth/login') {
        if (request.method !== 'GET') return send(response, 405, 'Method not allowed');
        const state = randomBytes(24).toString('base64url');
        const authorizationUrl = await oauth.client.authorize(config.adminHandle, { state });
        return redirect(response, authorizationUrl.toString(), cookie(STATE_COOKIE, state, 600));
      }
      if (url.pathname === '/oauth/callback') {
        if (request.method !== 'GET') return send(response, 405, 'Method not allowed');
        const state = cookies(request)[STATE_COOKIE];
        if (!state) {
          return send(response, 403, 'Invalid OAuth state. Please start the sign-in process again.');
        }
        // The OAuth client generates and validates the protocol `state` itself.
        // The value supplied to authorize() is application state, returned here
        // as result.state, and is deliberately different from the URL parameter.
        let result: Awaited<ReturnType<typeof oauth.client.callback>>;
        try {
          result = await oauth.client.callback(url.searchParams);
        } catch (error) {
          logger.warn('OAuth callback validation failed', error);
          return send(response, 403, 'Invalid OAuth state. Please start the sign-in process again.');
        }
        if (!secureEqual(state, result.state) || result.session.did !== config.adminDid) {
          await oauth.sessionStore.del(result.session.did);
          return send(response, 403, 'This dashboard is restricted to its configured administrator.');
        }
        await oauth.sessionStore.del(result.session.did);
        const token = await createDashboardSession(database, config);
        return redirect(response, '/', [cookie(SESSION_COOKIE, token, 43_200), cookie(STATE_COOKIE, '', 0)]);
      }

      const token = cookies(request)[SESSION_COOKIE];
      const authenticated = await validateDashboardSession(database, config, token);
      if (url.pathname === '/logout' && request.method === 'POST') {
        await deleteDashboardSession(database, config, token);
        return redirect(response, '/', cookie(SESSION_COOKIE, '', 0));
      }
      if (url.pathname === '/') return send(response, 200, authenticated ? dashboardPage : loginPage, 'text/html; charset=utf-8');
      if (!authenticated) return send(response, 401, JSON.stringify({ error: 'Unauthorized' }), 'application/json');
      if (url.pathname === '/api/status') {
        return send(response, 200, JSON.stringify(await getDashboardStatus(database)), 'application/json');
      }
      return send(response, 404, 'Not found');
    } catch (error) {
      logger.error('Dashboard request failed', error);
      return send(response, 500, 'Internal server error');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  logger.info('Dashboard HTTP server listening', { port, enabled: Boolean(config), publicUrl: config?.publicUrl });
  return server;
};

import { randomBytes } from 'node:crypto';
import { JoseKey } from '@atproto/jwk-jose';

const key = await JoseKey.generate(['ES256'], 'dashboard-oauth');

console.log(`DASHBOARD_SESSION_SECRET=${randomBytes(32).toString('base64url')}`);
console.log(`DASHBOARD_OAUTH_PRIVATE_KEY=${JSON.stringify(key.privateJwk)}`);

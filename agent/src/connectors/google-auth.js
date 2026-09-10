/**
 * Google service-account auth, done with the crypto module Node already has.
 *
 * The `googleapis` package would do this too, but it brings ~50 transitive
 * dependencies into a workflow that otherwise installs nothing. A signed JWT
 * exchanged for an access token is about thirty lines, so we do it here.
 */

import { createSign } from 'node:crypto';
import { requestJson } from '../http.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Base64url, which is base64 with three substitutions and no padding. */
function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Exchanges a service account for an access token covering `scopes`.
 *
 * Tokens last an hour and a whole run takes under a minute, so the token is
 * cached per scope set for the life of the process and never refreshed.
 */
export function createGoogleAuth(serviceAccount, { fetchImpl, now = () => Date.now() } = {}) {
  const cache = new Map();

  return async function getAccessToken(scopes) {
    const scope = [].concat(scopes).join(' ');
    const cached = cache.get(scope);
    if (cached && cached.expiresAt > now() + 60_000) return cached.token;

    const issuedAt = Math.floor(now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
      iss: serviceAccount.client_email,
      scope,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }));

    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    // GitHub secrets round-trip newlines as the two characters \ and n.
    const privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');
    const signature = b64url(signer.sign(privateKey));

    const payload = await requestJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }).toString(),
      label: 'Google token exchange',
      fetchImpl,
    });

    if (!payload.access_token) {
      throw new Error(`Google token exchange returned no access_token: ${JSON.stringify(payload)}`);
    }

    cache.set(scope, {
      token: payload.access_token,
      expiresAt: now() + (payload.expires_in || 3600) * 1000,
    });
    return payload.access_token;
  };
}

export const SCOPES = {
  searchConsole: 'https://www.googleapis.com/auth/webmasters.readonly',
  analytics: 'https://www.googleapis.com/auth/analytics.readonly',
  sheets: 'https://www.googleapis.com/auth/spreadsheets.readonly',
};

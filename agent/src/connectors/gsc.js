/**
 * Google Search Console.
 *
 * The most useful of the four sources, because it is the only one that says
 * what people typed *and* whether they clicked — which is the difference
 * between "write something new" and "the page is fine, the title is bad".
 */

import { requestJson } from '../http.js';
import { SCOPES } from './google-auth.js';

const BASE = 'https://searchconsole.googleapis.com/webmasters/v3/sites';

function endpoint(siteUrl) {
  return `${BASE}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
}

export function createSearchConsoleClient({ getAccessToken, siteUrl, fetchImpl }) {
  async function query({ startDate, endDate, dimensions, rowLimit = 5000 }) {
    const token = await getAccessToken(SCOPES.searchConsole);
    const payload = await requestJson(endpoint(siteUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, dataState: 'all' }),
      label: `Search Console ${dimensions.join('+')}`,
      fetchImpl,
    });

    return (payload.rows || []).map((row) => ({
      keys: row.keys || [],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    }));
  }

  return {
    /** What people searched, and how we did on it. */
    async queries(window, options) {
      const rows = await query({ ...window, dimensions: ['query'], ...options });
      return rows.map((row) => ({ query: row.keys[0], ...row, keys: undefined }));
    },

    /** How each page performed, for decay detection. */
    async pages(window, options) {
      const rows = await query({ ...window, dimensions: ['page'], ...options });
      return rows.map((row) => ({ page: row.keys[0], ...row, keys: undefined }));
    },

    /** Query-by-page, so a recommendation can name the page it should live on. */
    async queriesByPage(window, options) {
      const rows = await query({ ...window, dimensions: ['page', 'query'], ...options });
      return rows.map((row) => ({ page: row.keys[0], query: row.keys[1], ...row, keys: undefined }));
    },
  };
}

export async function fetchSearchConsole({ getAccessToken, siteUrl, windows, fetchImpl, log = () => {} }) {
  const client = createSearchConsoleClient({ getAccessToken, siteUrl, fetchImpl });
  const result = { queries: [], pages: [], priorPages: [], queriesByPage: [], errors: [] };

  const jobs = [
    ['queries', () => client.queries(windows.current)],
    ['pages', () => client.pages(windows.current, { rowLimit: 1000 })],
    ['priorPages', () => client.pages(windows.prior, { rowLimit: 1000 })],
    ['queriesByPage', () => client.queriesByPage(windows.current, { rowLimit: 5000 })],
  ];

  // Sequential on purpose: Search Console rate-limits per minute per site, and
  // four parallel 5000-row queries is a reliable way to see a 429.
  for (const [name, run] of jobs) {
    try {
      result[name] = await run();
      log(`Search Console: ${result[name].length} rows for ${name}`);
    } catch (error) {
      result.errors.push(`${name}: ${error.message}`);
    }
  }

  return result;
}

/**
 * Google Analytics 4.
 *
 * GA4 answers the question Search Console can't: what people did once they
 * arrived. A page can hold its rankings and still stop producing enquiries,
 * and that shows up here first.
 */

import { requestJson } from '../http.js';
import { SCOPES } from './google-auth.js';

const BASE = 'https://analyticsdata.googleapis.com/v1beta/properties';

export function createGa4Client({ getAccessToken, propertyId, fetchImpl }) {
  async function runReport(body, label) {
    const token = await getAccessToken(SCOPES.analytics);
    const payload = await requestJson(`${BASE}/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      label: `GA4 ${label}`,
      fetchImpl,
    });
    return shapeReport(payload);
  }

  return {
    /** Per-page engagement for the current window, prior window alongside. */
    pages(windows) {
      return runReport({
        dateRanges: [
          { ...windows.current, name: 'current' },
          { ...windows.prior, name: 'prior' },
        ],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'userEngagementDuration' },
          { name: 'keyEvents' },
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 500,
      }, 'pages');
    },

    /** Where traffic comes from, so a channel recommendation can be weighted by it. */
    channels(windows) {
      return runReport({
        dateRanges: [{ ...windows.current, name: 'current' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
        limit: 50,
      }, 'channels');
    },

    /** Which landing pages actually convert, not just which are read. */
    landingPages(windows) {
      return runReport({
        dateRanges: [{ ...windows.current, name: 'current' }],
        dimensions: [{ name: 'landingPage' }],
        metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
        orderBys: [{ metric: { metricName: 'keyEvents' }, desc: true }],
        limit: 200,
      }, 'landingPages');
    },
  };
}

/**
 * GA4 returns parallel arrays of dimension and metric values plus separate
 * header arrays. Flatten to plain objects keyed by name, with the date range
 * (when there is more than one) carried as `dateRange`.
 */
export function shapeReport(payload) {
  const dimensionNames = (payload.dimensionHeaders || []).map((h) => h.name);
  const metricNames = (payload.metricHeaders || []).map((h) => h.name);

  return (payload.rows || []).map((row) => {
    const record = {};
    dimensionNames.forEach((name, i) => {
      const value = row.dimensionValues?.[i]?.value ?? '';
      // GA4 names the comparison dimension `dateRange` only when you asked for
      // more than one range; otherwise it isn't present at all.
      if (name === 'dateRange') record.dateRange = value;
      else record[name] = value;
    });
    metricNames.forEach((name, i) => {
      record[name] = Number.parseFloat(row.metricValues?.[i]?.value ?? '0') || 0;
    });
    return record;
  });
}

export async function fetchGa4({ getAccessToken, propertyId, windows, fetchImpl, log = () => {} }) {
  const client = createGa4Client({ getAccessToken, propertyId, fetchImpl });
  const result = { pages: [], channels: [], landingPages: [], errors: [] };

  for (const name of ['pages', 'channels', 'landingPages']) {
    try {
      result[name] = await client[name](windows);
      log(`GA4: ${result[name].length} rows for ${name}`);
    } catch (error) {
      result.errors.push(`${name}: ${error.message}`);
    }
  }

  return result;
}

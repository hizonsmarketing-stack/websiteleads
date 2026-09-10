/**
 * Semrush.
 *
 * Two things about this API surprise people. It answers in semicolon-delimited
 * CSV rather than JSON, and it reports failure as a 200 whose body begins
 * "ERROR" — so a run that ignores the body reads "ERROR 50 :: NOTHING FOUND"
 * as a successful result with one very strange keyword in it.
 *
 * It also bills per line returned, not per request. `display_limit` is
 * therefore a budget, not a page size, and the defaults here are chosen to
 * keep a weekly run in the low thousands of units.
 */

import { request } from '../http.js';

const BASE_URL = 'https://api.semrush.com/';

/** Column codes, and what they actually mean. */
const COLUMNS = {
  organic: 'Ph,Po,Pp,Pd,Nq,Cp,Ur,Tr,Co,Nr',
  competitors: 'Dn,Cr,Np,Or,Ot',
};

/**
 * Semrush CSV: `;`-delimited, first row is the header, fields are unquoted in
 * practice but we honour quotes anyway rather than trusting that forever.
 */
export function parseSemrushCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (/^ERROR\s+\d+/i.test(trimmed)) {
    const message = trimmed.split('::')[1]?.trim() || trimmed;
    // "NOTHING FOUND" is Semrush saying the domain has no data for that report,
    // which is an empty result, not a failure.
    if (/nothing found/i.test(message)) return [];
    throw new Error(`Semrush: ${message}`);
  }

  const lines = trimmed.split(/\r?\n/);
  const headers = splitRow(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = splitRow(line);
    const row = {};
    headers.forEach((header, i) => { row[header] = cells[i] ?? ''; });
    return row;
  });
}

function splitRow(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ';' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

const num = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function createSemrushClient({ apiKey, database = 'ph', fetchImpl } = {}) {
  async function call(type, params, limit) {
    const query = new URLSearchParams({
      type,
      key: apiKey,
      database,
      display_limit: String(limit),
      export_columns: params.export_columns,
      ...params,
    });
    const { body } = await request(`${BASE_URL}?${query}`, {
      label: `Semrush ${type}`,
      fetchImpl,
      // Semrush throttles hard on burst; give it room rather than failing the run.
      retries: 4,
    });
    return parseSemrushCsv(body);
  }

  return {
    /** Every keyword the domain ranks for, with position and volume. */
    async organicKeywords(domain, { limit = 1000 } = {}) {
      const rows = await call('domain_organic', { domain, export_columns: COLUMNS.organic }, limit);
      return rows.map((row) => ({
        keyword: row.Keyword || '',
        position: num(row.Position),
        previousPosition: num(row['Previous Position']),
        volume: num(row['Search Volume']),
        cpc: num(row['CPC']),
        url: row.URL || '',
        trafficShare: num(row['Traffic (%)']),
        competition: num(row['Competition']),
        results: num(row['Number of Results']),
      })).filter((row) => row.keyword);
    },

    /** Domains competing for the same organic keywords, most relevant first. */
    async competitors(domain, { limit = 5 } = {}) {
      const rows = await call('domain_organic_organic', { domain, export_columns: COLUMNS.competitors }, limit);
      return rows.map((row) => ({
        domain: row.Domain || '',
        relevance: num(row['Competitor Relevance']),
        commonKeywords: num(row['Common Keywords']),
        organicKeywords: num(row['Organic Keywords']),
        organicTraffic: num(row['Organic Traffic']),
      })).filter((row) => row.domain);
    },
  };
}

/**
 * Pulls everything the analysis needs, and never lets one failed report take
 * down the run — a missing competitor list still leaves useful keyword data.
 */
export async function fetchSemrush({ apiKey, database, domain, competitorCount = 3, keywordLimit = 1000, fetchImpl, log = () => {} }) {
  const client = createSemrushClient({ apiKey, database, fetchImpl });
  const result = { keywords: [], competitors: [], competitorKeywords: {}, errors: [] };

  try {
    result.keywords = await client.organicKeywords(domain, { limit: keywordLimit });
    log(`Semrush: ${result.keywords.length} organic keywords for ${domain}`);
  } catch (error) {
    result.errors.push(`organic keywords: ${error.message}`);
  }

  try {
    result.competitors = await client.competitors(domain, { limit: competitorCount + 2 });
  } catch (error) {
    result.errors.push(`competitors: ${error.message}`);
  }

  // Only the most relevant few, and fewer keywords each — this is the
  // expensive part of the run and the tail adds little.
  const targets = result.competitors
    .filter((competitor) => competitor.domain !== domain)
    .slice(0, competitorCount);

  for (const competitor of targets) {
    try {
      result.competitorKeywords[competitor.domain] =
        await client.organicKeywords(competitor.domain, { limit: Math.round(keywordLimit / 2) });
      log(`Semrush: ${result.competitorKeywords[competitor.domain].length} keywords for ${competitor.domain}`);
    } catch (error) {
      result.errors.push(`competitor ${competitor.domain}: ${error.message}`);
    }
  }

  return result;
}

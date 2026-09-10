/**
 * The lead sheet this repository already fills.
 *
 * This is the source that makes the whole agent worth running. Semrush can say
 * a keyword has volume and GA4 can say a page is read, but only the sheet
 * knows that eleven of last quarter's corporate enquiries arrived through the
 * Christmas-party form. Content that produced enquiries and content that
 * produced traffic are different lists, and this is how we tell them apart.
 *
 * Read-only, and it reads the tabs the automation maintains — `_Sources` for
 * the per-form counts and `All Leads` for event-type mix over time.
 */

import { requestJson } from '../http.js';
import { SCOPES } from './google-auth.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function readRange(spreadsheetId, range, { getAccessToken, fetchImpl }) {
  const token = await getAccessToken(SCOPES.sheets);
  const url = `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const payload = await requestJson(url, {
    headers: { Authorization: `Bearer ${token}` },
    label: `Sheets ${range}`,
    fetchImpl,
  });
  return payload.values || [];
}

/** Header row plus data rows becomes an array of objects keyed by header. */
export function rowsToObjects(values) {
  if (!values.length) return [];
  const headers = values[0].map((header) => String(header || '').trim());
  return values.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, i) => {
      if (header) record[header] = row[i] ?? '';
    });
    return record;
  });
}

/** Tolerant lookup — the sheet's column names have drifted before. */
function field(record, ...names) {
  for (const name of names) {
    const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key && String(record[key]).trim()) return String(record[key]).trim();
  }
  return '';
}

export async function fetchLeads({ spreadsheetId, getAccessToken, windows, fetchImpl, log = () => {} }) {
  const result = { sources: [], byEventType: {}, bySubSource: {}, total: 0, errors: [] };

  try {
    const rows = rowsToObjects(await readRange(spreadsheetId, '_Sources!A1:Z500', { getAccessToken, fetchImpl }));
    result.sources = rows.map((row) => ({
      source: field(row, 'Source'),
      subSource: field(row, 'Sub-Source', 'Sub Source', 'SubSource'),
      leads: Number.parseInt(field(row, 'Leads', 'Lead Count', 'Count') || '0', 10) || 0,
      lastSeen: field(row, 'Last Seen', 'Last Lead'),
    })).filter((row) => row.subSource);
    log(`Leads: ${result.sources.length} registered sub-sources`);
  } catch (error) {
    result.errors.push(`_Sources: ${error.message}`);
  }

  try {
    const rows = rowsToObjects(await readRange(spreadsheetId, 'All Leads!A1:Z5000', { getAccessToken, fetchImpl }));
    const since = new Date(windows.current.startDate).getTime();

    for (const row of rows) {
      const receivedRaw = field(row, 'Date Received', 'Received', 'Timestamp', 'Date');
      const received = receivedRaw ? new Date(receivedRaw).getTime() : NaN;
      // Undated rows are counted rather than dropped; migrated leads often
      // have no timestamp and excluding them would understate every total.
      if (Number.isFinite(received) && received < since) continue;

      const eventType = field(row, 'Event Type') || 'Unassigned';
      const subSource = field(row, 'Sub-Source', 'Sub Source', 'SubSource') || 'Unknown';
      result.byEventType[eventType] = (result.byEventType[eventType] || 0) + 1;
      result.bySubSource[subSource] = (result.bySubSource[subSource] || 0) + 1;
      result.total += 1;
    }
    log(`Leads: ${result.total} leads in the current window`);
  } catch (error) {
    result.errors.push(`All Leads: ${error.message}`);
  }

  return result;
}

/**
 * Sheet plumbing: tab creation, header management, and reading/writing lead
 * rows by column name rather than by position, so a column can be inserted in
 * the spreadsheet without breaking the script.
 */

/** Column header -> lead object property. */
const COLUMN_TO_FIELD = {
  'Lead ID': 'leadId',
  'Received At': 'receivedAt',
  'Source': 'source',
  'Sub-Source': 'subSource',
  'Event Type': 'eventTypeLabel',
  'Event Type (Raw)': 'eventTypeRaw',
  'Full Name': 'fullName',
  'First Name': 'firstName',
  'Last Name': 'lastName',
  'Email': 'email',
  'Phone': 'phone',
  'Phone (Raw)': 'phoneRaw',
  'Company': 'company',
  'Event Date': 'eventDate',
  'Guest Count': 'guestCount',
  'Venue / Location': 'venue',
  'Budget': 'budget',
  'Message': 'message',
  'Campaign': 'campaign',
  'Assigned To': 'assignedTo',
  'Status': 'status',
  'Touches': 'touches',
  'First Seen At': 'firstSeenAt',
  'Last Touch At': 'lastTouchAt',
  'All Sub-Sources': 'allSubSources',
  'Raw Ref': 'rawRef',
  'Matched On': 'matchedOn',
  'Original Lead ID': 'originalLeadId',
  'Original Tab': 'originalTab'
};

/**
 * Returns a sheet, creating it with the given headers when absent. When the
 * sheet already exists, any header in `headers` that is missing is appended to
 * the right — existing columns and their data are never moved or deleted.
 * @param {string} name
 * @param {!Array<string>} headers
 * @return {!GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow_(sheet, headers.length);
    return sheet;
  }
  ensureHeaders_(sheet, headers);
  return sheet;
}

/**
 * Adds any missing headers to the right of the existing ones.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {!Array<string>} headers
 */
function ensureHeaders_(sheet, headers) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function (h) { return cleanText_(h); });

  if (existing.join('') === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow_(sheet, headers.length);
    return;
  }

  const have = {};
  existing.forEach(function (h) { if (h) have[squashKey_(h)] = true; });
  const missing = headers.filter(function (h) { return !have[squashKey_(h)]; });
  if (!missing.length) return;

  // Append after the last populated column — never over a gap in the header row.
  const startCol = width + 1;
  const needed = startCol + missing.length - 1;
  if (sheet.getMaxColumns() < needed) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
  }
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  formatHeaderRow_(sheet, needed);
}

/** Bolds, freezes and sizes the header row. */
function formatHeaderRow_(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#1c3d5a')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);
}

/**
 * Header text -> 1-based column number for a sheet.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {!Object<string,number>} Keyed by squashed header.
 */
function headerMap_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const map = {};
  headers.forEach(function (header, i) {
    const key = squashKey_(header);
    if (key && map[key] === undefined) map[key] = i + 1;
  });
  return map;
}

/**
 * Renders a lead object into a row array matching the sheet's own header order.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {!Object} lead
 * @return {!Array<*>}
 */
function leadToRow_(sheet, lead) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  return headers.map(function (header) {
    const field = COLUMN_TO_FIELD[cleanText_(header)];
    if (!field) return '';
    const value = lead[field];
    return (value === undefined || value === null) ? '' : value;
  });
}

/**
 * Appends a lead to a sheet and returns the row number written.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {!Object} lead
 * @return {number}
 */
function appendLead_(sheet, lead) {
  const row = leadToRow_(sheet, lead);
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/**
 * Locates a lead by id. `hintRow` (from the index) is checked first; a full
 * column scan is the fallback, so manually inserted or deleted rows in a team
 * tab cannot desynchronise the automation.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} leadId
 * @param {number=} hintRow
 * @return {number} 1-based row, or 0 when not found.
 */
function findLeadRow_(sheet, leadId, hintRow) {
  const idCol = headerMap_(sheet)[squashKey_('Lead ID')];
  if (!idCol) return 0;

  if (hintRow && hintRow > 1 && hintRow <= sheet.getLastRow()) {
    if (cleanText_(sheet.getRange(hintRow, idCol).getValue()) === leadId) return hintRow;
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (cleanText_(ids[i][0]) === leadId) return i + 2;
  }
  return 0;
}

/**
 * Writes named fields into an existing row, leaving every other cell alone.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} row
 * @param {!Object<string,*>} updates Keyed by column header.
 */
function updateRowCells_(sheet, row, updates) {
  const map = headerMap_(sheet);
  Object.keys(updates).forEach(function (header) {
    const col = map[squashKey_(header)];
    if (col) sheet.getRange(row, col).setValue(updates[header]);
  });
}

/**
 * Reads one row back as a lead-shaped object.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} row
 * @return {!Object}
 */
function readLeadRow_(sheet, row) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const values = sheet.getRange(row, 1, 1, width).getValues()[0];
  const lead = {};
  headers.forEach(function (header, i) {
    const field = COLUMN_TO_FIELD[cleanText_(header)];
    if (field) lead[field] = values[i];
  });
  return lead;
}

/** @return {!Array<!Object>} Every configured event type plus the fallback. */
function allEventTypes_() {
  return EVENT_TYPES.concat([FALLBACK_EVENT_TYPE]);
}

/** @return {!Array<string>} Every tab a routed lead can land in. */
function teamTabNames_() {
  return allEventTypes_().map(function (t) { return t.tab; });
}

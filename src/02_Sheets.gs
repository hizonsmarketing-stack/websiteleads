/**
 * Sheet plumbing: tab creation, header management, and reading/writing lead
 * rows by column name rather than by position, so a column can be inserted in
 * the spreadsheet without breaking the script.
 */

/** Column header -> lead object property. */
const COLUMN_TO_FIELD = {
  'Presenter': 'presenter',
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
  'Event Date (Raw)': 'eventDateRaw',
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
 * Canonical fields an existing column may be bound to by its alias.
 *
 * Message is deliberately absent: a tab can carry several notes columns
 * (SALES NOTES, CLIENT NOTES, CONTACT METHOD), and writing the composed
 * message into whichever came first would overwrite one of them.
 */
const ALIAS_BINDABLE_FIELDS = {
  fullName: true, firstName: true, lastName: true, email: true, phone: true,
  company: true, eventType: true, eventDate: true, guestCount: true,
  venue: true, budget: true, campaign: true, presenter: true,
  assignedTo: true, status: true, receivedAt: true, source: true, subSource: true
};

/**
 * Where the alias dictionary's name for a field differs from the property the
 * lead record carries it in. The dictionary answers "what does this header
 * mean"; the lead record is what gets written. Without this translation a
 * bound column would read a property that does not exist and stay blank.
 */
const FIELD_TO_LEAD_PROPERTY = {
  eventType: 'eventTypeLabel'
};

let FIELD_COLUMNS_CACHE_ = {};

/**
 * Works out which column on a sheet serves each canonical field.
 *
 * A tab that has been in use for years does not use our column names. It says
 * "Contact number", not "Phone"; "Guests", not "Guest Count". Those columns
 * mean the same thing, so they are used as they are rather than left blank
 * beside a second column that duplicates them.
 *
 * Resolution runs in two passes so it is predictable: a column named exactly
 * like ours claims that field first, wherever it sits; then aliases fill what
 * is left, leftmost column winning.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {{byField: !Object<string,number>, byColumn: !Array<string>,
 *           headers: !Array<string>}}
 */
function fieldColumns_(sheet) {
  const name = sheet.getName();
  const width = Math.max(sheet.getLastColumn(), 1);
  const cached = FIELD_COLUMNS_CACHE_[name];
  if (cached && cached.width === width) return cached.value;

  const headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function (h) { return cleanText_(h); });

  const canonical = {};
  Object.keys(COLUMN_TO_FIELD).forEach(function (header) {
    canonical[squashKey_(header)] = COLUMN_TO_FIELD[header];
  });

  const byField = {};
  const byColumn = [];

  headers.forEach(function (header, i) {
    const field = canonical[squashKey_(header)];
    if (field && byField[field] === undefined) {
      byField[field] = i + 1;
      byColumn[i] = field;
    }
  });

  headers.forEach(function (header, i) {
    if (byColumn[i] || !header || isNoiseKey_(header)) return;
    const match = matchField_(header);
    if (!match.field || ALIAS_BINDABLE_FIELDS[match.field] !== true) return;
    const field = FIELD_TO_LEAD_PROPERTY[match.field] || match.field;
    if (byField[field] !== undefined) return;
    byField[field] = i + 1;
    byColumn[i] = field;
  });

  const value = { byField: byField, byColumn: byColumn, headers: headers };
  FIELD_COLUMNS_CACHE_[name] = { width: width, value: value };
  return value;
}

/** Forgets the cached bindings for a sheet whose header row just changed. */
function forgetFieldColumns_(sheetName) {
  delete FIELD_COLUMNS_CACHE_[sheetName];
}

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
    forgetFieldColumns_(name);
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
    forgetFieldColumns_(sheet.getName());
    return;
  }

  const bindings = fieldColumns_(sheet);
  const have = {};
  existing.forEach(function (h) { if (h) have[squashKey_(h)] = true; });

  const missing = headers.filter(function (h) {
    if (have[squashKey_(h)]) return false;
    // A column already doing this job — "Contact number" for Phone — means we
    // do not add a second one beside it.
    const field = COLUMN_TO_FIELD[h];
    return !(field && bindings.byField[field] !== undefined);
  });
  if (!missing.length) return;

  // Append after the last populated column — never over a gap in the header row.
  const startCol = width + 1;
  const needed = startCol + missing.length - 1;
  if (sheet.getMaxColumns() < needed) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
  }
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  formatHeaderRow_(sheet, needed);
  forgetFieldColumns_(sheet.getName());
  protectTextColumns_(sheet);
}

/**
 * Forces the phone columns to plain text.
 *
 * Left as "automatic", Sheets reads a leading + as the start of a formula and
 * shows +639171234567 as the number 639171234567, and a long run of digits can
 * come out as 6.39E+11. Either way the number a rep dials is wrong, so the
 * columns holding one are formatted as text.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function protectTextColumns_(sheet) {
  const bindings = fieldColumns_(sheet);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  ['phone', 'phoneRaw'].forEach(function (field) {
    const col = bindings.byField[field];
    if (col) sheet.getRange(2, col, rows, 1).setNumberFormat('@');
  });
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
  const bindings = fieldColumns_(sheet);
  return bindings.headers.map(function (header, i) {
    const field = bindings.byColumn[i];
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
  const idCol = fieldColumns_(sheet).byField.leadId;
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
  const bindings = fieldColumns_(sheet);
  const map = headerMap_(sheet);
  Object.keys(updates).forEach(function (header) {
    const field = COLUMN_TO_FIELD[header];
    const col = (field && bindings.byField[field]) || map[squashKey_(header)];
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
  const bindings = fieldColumns_(sheet);
  const values = sheet.getRange(row, 1, 1, bindings.headers.length).getValues()[0];
  const lead = {};
  bindings.byColumn.forEach(function (field, i) {
    if (field) lead[field] = values[i];
  });
  return lead;
}

/** @return {!Array<!Object>} Every configured event type plus the fallback. */
function allEventTypes_() {
  return EVENT_TYPES.concat([FALLBACK_EVENT_TYPE]);
}

/** @return {!Array<string>} The shared tab for each event type. */
function teamTabNames_() {
  return allEventTypes_().map(function (t) { return t.tab; });
}

/**
 * Every tab a routed lead can land in: the shared event-type tabs plus each
 * salesperson's own tab from the _Team roster.
 * @return {!Array<string>}
 */
function leadTabNames_() {
  const names = teamTabNames_();
  loadTeam_().forEach(function (member) {
    if (member.tab && names.indexOf(member.tab) === -1) names.push(member.tab);
  });
  return names;
}

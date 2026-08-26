/**
 * Bridal-fair (exhibit) worksheet import.
 *
 * Fair organisers send a spreadsheet in whatever layout they like: a title row
 * or two before the real headers, a "Contact No." column here, a "Mobile"
 * column there. The importer finds the header row, maps the columns through the
 * same alias dictionary the webhooks use, and pushes each row through the same
 * intake pipeline — so exhibit leads are deduped against website and Google Ads
 * leads, not just against each other.
 */

/**
 * Imports every row of a worksheet as Exhibit leads.
 *
 * @param {!Object} options
 * @param {string=} options.spreadsheetId Source spreadsheet; defaults to this one.
 * @param {string=} options.spreadsheetUrl Alternative to spreadsheetId.
 * @param {string=} options.sheetName Tab within the source; defaults to the first.
 * @param {string} options.fairName Sub-source, e.g. "Wedding Expo Manila 2026".
 * @param {string=} options.fairDate Used as the received date for every row.
 * @param {string=} options.defaultEventType Defaults to "Wedding".
 * @param {number=} options.headerRow 1-based; auto-detected when omitted.
 * @return {!Object} The intakeBatch_ summary, plus `headerRow` and `mapped`.
 */
function importFairWorksheet(options) {
  const opts = options || {};
  if (!cleanText_(opts.fairName)) throw new Error('A fair name is required — it becomes the sub-source.');

  const sheet = resolveSourceSheet_(opts);
  const table = readTable_(sheet, opts.headerRow);
  if (!table.rows.length) {
    throw new Error('No data rows found in "' + sheet.getName() + '" below header row ' + table.headerRow + '.');
  }

  const receivedAt = opts.fairDate
    ? normalizeDate_(opts.fairDate) + ' 00:00:00'
    : nowStamp_();
  const defaultEventType = cleanText_(opts.defaultEventType) || 'Wedding';

  const records = table.rows.map(function (row) {
    const flat = {};
    table.headers.forEach(function (header, i) {
      const value = row[i];
      if (!header || value === '' || value === null || value === undefined) return;
      // Organiser sheets sometimes repeat a header ("Contact No." twice for two
      // numbers); keep both rather than letting the second overwrite the first.
      const key = flat[header] === undefined ? header : header + ' (' + (i + 1) + ')';
      flat[key] = value;
    });
    return {
      flat: flat,
      source: SOURCES.exhibit,
      subSource: cleanText_(opts.fairName),
      receivedAt: receivedAt,
      defaultEventType: defaultEventType
    };
  }).filter(function (record) {
    return Object.keys(record.flat).length > 0;
  });

  const rawRef = storeRaw_(SOURCES.exhibit, cleanText_(opts.fairName), {
    sheet: sheet.getName(),
    headerRow: table.headerRow,
    headers: table.headers,
    rowCount: records.length
  });
  records.forEach(function (record) { record.rawRef = rawRef; });

  const summary = intakeBatch_(records, 'fair-import');
  summary.headerRow = table.headerRow;
  summary.mapped = describeMapping_(table.headers);
  summary.fairName = cleanText_(opts.fairName);
  log_('INFO', 'fair-import', 'Imported "' + summary.fairName + '"', {
    headerRow: table.headerRow, mapped: summary.mapped, created: summary.created,
    merged: summary.merged, skipped: summary.skipped
  });
  return summary;
}

/**
 * Resolves the sheet to read from: another spreadsheet by id/URL, or a tab in
 * this one (which is what you get after pasting the organiser's file in).
 * @param {!Object} opts
 * @return {!GoogleAppsScript.Spreadsheet.Sheet}
 */
function resolveSourceSheet_(opts) {
  let book = getSpreadsheet_();
  const id = cleanText_(opts.spreadsheetId) || extractSpreadsheetId_(opts.spreadsheetUrl);
  if (id && id !== book.getId()) {
    try {
      book = SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error('Could not open spreadsheet "' + id + '". Check the link and that you have access.');
    }
  }

  const name = cleanText_(opts.sheetName);
  if (!name) return book.getSheets()[0];

  const sheet = book.getSheetByName(name);
  if (!sheet) {
    throw new Error('No tab named "' + name + '" in ' + book.getName() + '.');
  }
  return sheet;
}

/** @return {string} The spreadsheet id inside a Google Sheets URL, or ''. */
function extractSpreadsheetId_(url) {
  const text = cleanText_(url);
  if (!text) return '';
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(text) ? text : '';
}

/**
 * Reads a sheet into headers plus data rows, skipping any title rows above the
 * real header.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number=} headerRow 1-based; auto-detected when omitted.
 * @return {{headerRow: number, headers: !Array<string>, rows: !Array<!Array<*>>}}
 */
function readTable_(sheet, headerRow) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { headerRow: 1, headers: [], rows: [] };

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const index = (headerRow && headerRow > 0) ? headerRow - 1 : detectHeaderRow_(values);
  const headers = values[index].map(function (h) { return cleanText_(h); });

  const rows = values.slice(index + 1).filter(function (row) {
    return row.some(function (cell) { return cleanText_(cell) !== ''; });
  });
  return { headerRow: index + 1, headers: headers, rows: rows };
}

/**
 * Finds the header row: within the first 15 rows, the one whose cells map to
 * the most known fields, requiring at least two. Falls back to row 1.
 * @param {!Array<!Array<*>>} values
 * @return {number} 0-based index.
 */
function detectHeaderRow_(values) {
  let bestIndex = 0;
  let bestScore = 0;
  const limit = Math.min(values.length, 15);

  for (let i = 0; i < limit; i++) {
    let score = 0;
    values[i].forEach(function (cell) {
      const text = cleanText_(cell);
      if (!text || text.length > 80) return;
      if (matchField_(text).field) score++;
    });
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 2 ? bestIndex : 0;
}

/**
 * Explains how each column was interpreted, for the import confirmation.
 * @param {!Array<string>} headers
 * @return {!Object<string,string>} Header -> canonical field or "(notes)".
 */
function describeMapping_(headers) {
  const mapping = {};
  headers.forEach(function (header) {
    if (!header) return;
    if (isNoiseKey_(header)) {
      mapping[header] = '(ignored)';
      return;
    }
    const match = matchField_(header);
    mapping[header] = match.field ? humanizeKey_(match.field) : '(notes)';
  });
  return mapping;
}

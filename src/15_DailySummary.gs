/**
 * The daily summary block a caller's tab carries under each day's leads.
 *
 * The team was already writing these by hand — a date, the day's count, a line
 * per status, and the touches — typed into the middle of the tab between one
 * day's leads and the next. This writes the same block from what the rows
 * actually say, so the counts cannot drift from the leads they describe.
 *
 * It is deliberately the shape the team already uses rather than a tidy report
 * on a tab of its own: this is what they read, in the place they read it.
 */

/** The first line of a block, and how one is found again. */
const SUMMARY_DATE_LABEL = 'Date Received : ';

/** The last line: how many touches the day's leads have had between them. */
const SUMMARY_TOUCH_LABEL = 'Total Leads Touch : ';

/** The line counting the day's leads. */
const SUMMARY_TOTAL_LABEL = 'Total Leads Received : ';

/**
 * Counts one day's leads on one tab.
 *
 * Statuses are counted as they are actually written, not against a fixed list.
 * A team using a word of its own — "CORPO" on a lead handed to the corporate
 * desk — gets a line for it, which is the honest answer: the block should say
 * what the tab says. Known statuses come first, in the order a lead moves
 * through them, and anything else follows alphabetically so the block is
 * stable from one day to the next.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} dateKey yyyy-MM-dd.
 * @return {{total: number, touches: number, byStatus: !Array<{label: string, count: number}>}}
 */
function dailySummaryCounts_(sheet, dateKey) {
  const columns = fieldColumns_(sheet).byField;
  const empty = { total: 0, touches: 0, byStatus: [] };
  if (!columns.leadId || !columns.receivedAt || sheet.getLastRow() < 2) return empty;

  const width = sheet.getLastColumn();
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  const at = function (row, field) {
    return columns[field] ? row[columns[field] - 1] : '';
  };

  const counts = {};
  let total = 0;
  let touches = 0;

  rows.forEach(function (row) {
    if (!cleanText_(at(row, 'leadId'))) return;
    // Received At is written as "yyyy-MM-dd HH:mm:ss", so the day is its first
    // ten characters. Compared as text because a cell a person has retyped may
    // be a string where the automation wrote a date.
    if (cleanText_(at(row, 'receivedAt')).slice(0, 10) !== dateKey) return;

    total++;
    touches += Number(at(row, 'touches')) || 1;
    const status = cleanText_(at(row, 'status')) || '(no status)';
    counts[status] = (counts[status] || 0) + 1;
  });

  const known = STATUS_OPTIONS.concat(AUTOMATIC_STATUSES);
  const rank = function (label) {
    // Through the alias first, so a row marked NR sorts where No Response does
    // rather than falling in with the words the script has never heard of.
    const canonical = statusColourKey_(label) || label;
    const i = known.map(squashKey_).indexOf(squashKey_(canonical));
    return i === -1 ? known.length : i;
  };
  const byStatus = Object.keys(counts).sort(function (a, b) {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a < b ? -1 : (a > b ? 1 : 0);
  }).map(function (label) {
    return { label: label, count: counts[label] };
  });

  return { total: total, touches: touches, byStatus: byStatus };
}

/**
 * The lines of a block, as label/value pairs.
 * @param {string} dateKey yyyy-MM-dd.
 * @param {!Object} counts From dailySummaryCounts_.
 * @return {!Array<{label: string, value: *, colour: string}>}
 */
function dailySummaryLines_(dateKey, counts) {
  const lines = [
    { label: SUMMARY_DATE_LABEL + dateKey, value: '', colour: '' },
    { label: SUMMARY_TOTAL_LABEL, value: counts.total, colour: '' }
  ];
  counts.byStatus.forEach(function (entry) {
    // The same fill the status itself takes on a lead row, so the block reads
    // like the rows above it rather than like a separate thing.
    lines.push({
      label: entry.label + ' : ',
      value: entry.count,
      colour: STATUS_COLOURS[statusColourKey_(entry.label)] || ''
    });
  });
  lines.push({ label: SUMMARY_TOUCH_LABEL, value: counts.touches, colour: '' });
  return lines;
}

/** @return {string} The STATUS_COLOURS key a written status counts as, or ''. */
function statusColourKey_(written) {
  const wanted = squashKey_(written);
  let found = '';
  Object.keys(STATUS_COLOURS).forEach(function (status) {
    const spellings = [status].concat(STATUS_ALIASES[status] || []);
    if (spellings.some(function (word) { return squashKey_(word) === wanted; })) found = status;
  });
  return found;
}

/**
 * Finds the block already written for a date, if there is one.
 *
 * Located by its first line rather than by remembering a row number, because
 * rows move: a block written yesterday sits several leads higher today.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} dateKey
 * @param {number} labelCol 1-based column the labels are written in.
 * @return {number} 1-based row of the block's first line, or 0.
 */
function findDailySummaryRow_(sheet, dateKey, labelCol) {
  if (sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, labelCol, sheet.getLastRow() - 1, 1).getValues();
  const wanted = squashKey_(SUMMARY_DATE_LABEL + dateKey);
  for (let i = 0; i < values.length; i++) {
    if (squashKey_(values[i][0]) === wanted) return i + 2;
  }
  return 0;
}

/**
 * Writes, or brings up to date, one tab's block for one day.
 *
 * The block goes in the column the tab reads names in, with the counts beside
 * it, which is where the team was putting them by hand.
 *
 * Run twice for the same day it rewrites the block rather than adding a second
 * — a summary is a statement about a day, and a day has one. Where the shape
 * has changed since, because a status appeared that was not there before, it
 * says so instead of writing over a block of a different length: silently
 * leaving half an old block under a new one is worse than asking.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} dateKey yyyy-MM-dd.
 * @return {{ok: boolean, action: string, problem: (string|undefined),
 *     total: (number|undefined), row: (number|undefined)}}
 */
function writeDailySummary_(sheet, dateKey) {
  const columns = fieldColumns_(sheet).byField;
  const labelCol = columns.fullName;
  if (!labelCol) {
    return { ok: false, action: 'skipped',
      problem: sheet.getName() + ' has no Full Name column to write the block in.' };
  }

  const counts = dailySummaryCounts_(sheet, dateKey);
  if (!counts.total) {
    return { ok: false, action: 'skipped',
      problem: 'No leads on ' + sheet.getName() + ' for ' + dateKey + '.' };
  }

  const lines = dailySummaryLines_(dateKey, counts);
  const existing = findDailySummaryRow_(sheet, dateKey, labelCol);

  if (existing) {
    // Only the labels already there may be rewritten. Anything longer would run
    // past the block and over whatever follows it.
    const found = sheet.getRange(existing, labelCol, lines.length, 1).getValues();
    const sameShape = found.every(function (row, i) {
      return squashKey_(row[0]) === squashKey_(lines[i].label);
    });
    if (!sameShape) {
      return { ok: false, action: 'blocked', row: existing, problem:
        'The block for ' + dateKey + ' on ' + sheet.getName() + ' no longer matches ' +
        'what today\'s counts would write — a status has appeared since. Delete ' +
        'the block at row ' + existing + ' and run this again.' };
    }
    writeSummaryBlock_(sheet, existing, labelCol, lines);
    return { ok: true, action: 'updated', total: counts.total, row: existing };
  }

  const at = sheet.getLastRow() + 1;
  writeSummaryBlock_(sheet, at, labelCol, lines);
  return { ok: true, action: 'written', total: counts.total, row: at };
}

/**
 * Puts the lines on the sheet, label and value side by side.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} row First row of the block.
 * @param {number} labelCol
 * @param {!Array<!Object>} lines
 */
function writeSummaryBlock_(sheet, row, labelCol, lines) {
  const needed = row + lines.length - 1;
  if (sheet.getMaxRows() < needed) {
    sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
  }
  sheet.getRange(row, labelCol, lines.length, 2).setValues(lines.map(function (line) {
    return [line.label, line.value];
  }));
  lines.forEach(function (line, i) {
    if (line.colour) sheet.getRange(row + i, labelCol, 1, 2).setBackground(line.colour);
  });
}

/**
 * Writes the block for a day on every tab that has leads from it.
 *
 * @param {string=} dateKey yyyy-MM-dd; today when omitted.
 * @param {string=} onlyTab One tab, rather than all of them.
 * @return {{date: string, written: !Array<!Object>, skipped: !Array<!Object>}}
 */
function writeDailySummaries(dateKey, onlyTab) {
  return withLock_(function () {
    const day = cleanText_(dateKey) || nowStamp_().slice(0, 10);
    const tabs = onlyTab ? [onlyTab] : leadTabNames_();
    const written = [];
    const skipped = [];

    tabs.forEach(function (name) {
      const sheet = getSpreadsheet_().getSheetByName(name);
      if (!sheet) return;
      const result = writeDailySummary_(sheet, day);
      if (result.ok) written.push({ tab: name, total: result.total, action: result.action });
      else if (result.action === 'blocked') skipped.push({ tab: name, problem: result.problem });
    });

    log_('INFO', 'summary', 'Wrote the daily block', {
      date: day, tabs: written.length, blocked: skipped.length
    });
    return { date: day, written: written, skipped: skipped };
  }, 120000);
}

/**
 * Repairing a tab whose header row was overwritten.
 *
 * Pasting a block of leads over row 1 destroys the header row, and from then on
 * the automation recognises none of the tab's columns. It appends a fresh set
 * to the right — which is the right call, since losing the leads would be worse
 * — and writes every lead there from then on. The team goes on reading the
 * columns they have always read, which stay empty, and the tab looks as though
 * it simply stopped receiving work.
 *
 * Putting it right takes three steps in one order, and getting the order wrong
 * loses leads: the header row has to come back, the leads stranded in the
 * appended columns have to be moved into the columns they belong in, and only
 * then can the appended columns go. Deleting them first throws away every lead
 * that arrived since the paste.
 *
 * The original header names cannot be recovered from the tab — they were
 * overwritten. They are copied from another tab laid out the same way, which
 * the team always has, because the leads were pasted from one.
 */

/**
 * Works out what a damaged tab needs.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet The damaged tab.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} model A tab laid out as this one
 *     was, to take the header row from.
 * @return {{ok: boolean, problem: (string|undefined), headers: (!Array<string>|undefined),
 *     blockStart: (number|undefined), blockWidth: (number|undefined),
 *     stranded: (number|undefined), firstRowIsLead: (boolean|undefined)}}
 */
function planColumnRepair_(sheet, model) {
  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function (h) { return cleanText_(h); });

  // The appended set is a run of our own column names ending at the right edge.
  // Found by walking back from the end rather than searching, so a tab that
  // happens to have a column called Status somewhere in the middle is not
  // mistaken for the start of it.
  let blockStart = width + 1;
  for (let col = width; col >= 1; col--) {
    const expected = LEAD_COLUMNS[LEAD_COLUMNS.length - (width - col) - 1];
    if (!expected || squashKey_(headers[col - 1]) !== squashKey_(expected)) break;
    blockStart = col;
  }
  const blockWidth = width - blockStart + 1;

  if (blockWidth < LEAD_COLUMNS.length) {
    return { ok: false, problem: sheet.getName() + ' does not end in a set of ' +
      'columns this script appended, so there is nothing of that kind to undo. ' +
      'If its leads are landing somewhere unexpected, it is for another reason.' };
  }

  const modelWidth = model.getLastColumn();
  const modelHeaders = model.getRange(1, 1, 1, modelWidth).getValues()[0]
    .map(function (h) { return cleanText_(h); });
  if (modelWidth > blockStart - 1) {
    return { ok: false, problem: model.getName() + ' has ' + modelWidth +
      ' columns but only ' + (blockStart - 1) + ' are free on ' + sheet.getName() +
      '. Pick a tab laid out the way this one was before the paste.' };
  }

  // Row 1 holds a lead rather than headers, so the headers go in above it and
  // that lead keeps its place. Judged on whether anything in the row reads like
  // a header at all, not on the row number.
  const firstRowIsLead = !modelHeaders.some(function (header, i) {
    return header && squashKey_(headers[i]) === squashKey_(header);
  });

  let stranded = 0;
  if (sheet.getLastRow() > 1) {
    const ids = sheet.getRange(2, blockStart + LEAD_COLUMNS.indexOf('Lead ID'),
      sheet.getLastRow() - 1, 1).getValues();
    stranded = ids.filter(function (row) { return cleanText_(row[0]) !== ''; }).length;
  }

  return {
    ok: true, headers: modelHeaders, blockStart: blockStart,
    blockWidth: blockWidth, stranded: stranded, firstRowIsLead: firstRowIsLead
  };
}

/**
 * Puts a damaged tab back together.
 *
 * @param {string} tabName The damaged tab.
 * @param {string} modelTabName A tab laid out the same way.
 * @param {boolean=} dryRun Report without changing anything.
 * @return {!Object} What was done, or would be.
 */
function repairTabColumns(tabName, modelTabName, dryRun) {
  return withLock_(function () {
    const sheet = getSpreadsheet_().getSheetByName(cleanText_(tabName));
    if (!sheet) return { ok: false, problem: 'No tab called "' + tabName + '".' };
    const model = getSpreadsheet_().getSheetByName(cleanText_(modelTabName));
    if (!model) return { ok: false, problem: 'No tab called "' + modelTabName + '".' };
    if (model.getSheetId() === sheet.getSheetId()) {
      return { ok: false, problem: 'The tab cannot be its own model.' };
    }

    const plan = planColumnRepair_(sheet, model);
    if (!plan.ok) return plan;

    const summary = {
      ok: true, tab: sheet.getName(), model: model.getName(),
      headerRowAdded: plan.firstRowIsLead, moved: 0,
      columnsRemoved: plan.blockWidth, dryRun: !!dryRun
    };
    if (dryRun) {
      summary.moved = plan.stranded;
      return summary;
    }

    // 1. The header row first, so the columns on the left mean something again.
    if (plan.firstRowIsLead) sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, plan.headers.length).setValues([plan.headers]);
    formatHeaderRow_(sheet, plan.headers.length);
    forgetFieldColumns_(sheet.getName());

    // 2. Then the leads out of the appended columns and into the real ones.
    //    Before the columns go, never after: after, they are gone with them.
    const blockStart = plan.blockStart;
    const left = fieldColumnsWithin_(sheet, 1, blockStart - 1);
    const lastRow = sheet.getLastRow();

    // The appended columns were given their names on row 1, which is the row
    // holding the lead that was pasted over the headers. Inserting above it
    // carried those names down a row with it, so that row's appended cells
    // read "Presenter", "Lead ID", "Full Name" — and copying them across would
    // bury the pasted lead under the words. It is the one row to leave alone;
    // the names go when the columns do.
    const strayHeaderRow = plan.firstRowIsLead ? 2 : 0;

    if (lastRow > 1) {
      const block = sheet.getRange(2, blockStart, lastRow - 1, plan.blockWidth).getValues();
      const idCol = LEAD_COLUMNS.indexOf('Lead ID');
      block.forEach(function (row, i) {
        if (i + 2 === strayHeaderRow) return;
        if (!cleanText_(row[idCol])) return;
        const updates = {};
        LEAD_COLUMNS.forEach(function (header, c) {
          const field = COLUMN_TO_FIELD[header];
          const target = field && left[field];
          if (!target) return;
          if (row[c] === '' || row[c] === null || row[c] === undefined) return;
          updates[target] = row[c];
        });
        Object.keys(updates).forEach(function (col) {
          sheet.getRange(i + 2, Number(col)).setValue(updates[col]);
        });
        summary.moved++;
      });
    }

    // 3. Only now the appended columns, which hold nothing that is not already
    //    back where it belongs.
    sheet.deleteColumns(blockStart, plan.blockWidth);
    forgetFieldColumns_(sheet.getName());
    protectTextColumns_(sheet);

    log_('INFO', 'repair', 'Put a tab\'s columns back', {
      tab: summary.tab, model: summary.model, moved: summary.moved,
      columnsRemoved: summary.columnsRemoved, headerRowAdded: summary.headerRowAdded
    });
    return summary;
  }, 300000);
}

/**
 * Which column serves each field, looking only at part of a tab.
 *
 * The whole point of the repair is that the tab has two sets of columns and the
 * wrong one is winning, so the usual resolution — which takes the leftmost
 * match across the sheet — cannot be used to find the left-hand set while the
 * right-hand set is still there.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} from 1-based first column.
 * @param {number} to 1-based last column.
 * @return {!Object<string,number>} Field name -> 1-based column.
 */
function fieldColumnsWithin_(sheet, from, to) {
  if (to < from) return {};
  const headers = sheet.getRange(1, from, 1, to - from + 1).getValues()[0]
    .map(function (h) { return cleanText_(h); });

  const canonical = {};
  Object.keys(COLUMN_TO_FIELD).forEach(function (header) {
    canonical[squashKey_(header)] = COLUMN_TO_FIELD[header];
  });

  const byField = {};
  const taken = [];
  headers.forEach(function (header, i) {
    const field = canonical[squashKey_(header)];
    if (field && byField[field] === undefined) {
      byField[field] = from + i;
      taken[i] = true;
    }
  });
  headers.forEach(function (header, i) {
    if (taken[i] || !header || isNoiseKey_(header)) return;
    const match = matchField_(header);
    if (!match.field || ALIAS_BINDABLE_FIELDS[match.field] !== true) return;
    const field = FIELD_TO_LEAD_PROPERTY[match.field] || match.field;
    if (byField[field] !== undefined) return;
    byField[field] = from + i;
  });
  return byField;
}

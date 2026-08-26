/**
 * One-time migration of leads that already sit in a salesperson's tab.
 *
 * Rows stay exactly where they are — whoever owns a lead keeps it. What the
 * migration adds is the canonical columns alongside the existing ones, filled
 * in from whatever those rows already say, plus a Lead ID and an entry in the
 * dedupe index. From then on a returning inquiry is recognised as the same
 * person and merged into the historical row instead of being dealt out again.
 *
 * Nothing is deleted, no row moves, and no contact detail is rewritten: names,
 * emails and phone numbers stay exactly as they were typed, because those are
 * what a rep reads and dials. Matching happens on tidied copies held in the
 * index, not in the sheet.
 *
 * The one value that can change is Event Date, and only where it reads one way
 * only — "03/15/2027" becomes "2027-03-15" so the column sorts, with the
 * original kept beside it in Event Date (Raw). Turn that off with the
 * "Normalise Event Dates On Import" setting. A date like "03/04/2027" that
 * could be read either way round is always left as typed and reported,
 * because guessing would move a real booking by weeks.
 *
 * A tab that already has a Presenter column keeps every value in it. The
 * repeating sequence only governs leads that arrive from here on.
 *
 * Rows are processed in chunks with a time budget. A tab too big to finish
 * inside Apps Script's six minutes stops cleanly and says how many are left;
 * running it again picks up where it stopped, because a row that already has a
 * Lead ID is skipped.
 */

/** Rows read, filled and written back in one go. */
const MIGRATE_CHUNK_ROWS = 200;

/** Default seconds to work for before stopping cleanly. Apps Script kills a
 *  run at six minutes; stopping first is what makes the import resumable. */
const MIGRATE_TIME_BUDGET_SECONDS = 240;

/**
 * @param {!Object} options
 * @param {string} options.tabName The salesperson tab to migrate.
 * @param {string=} options.salesperson Owner to stamp on rows with no owner;
 *     defaults to the tab name.
 * @param {string=} options.source Defaults to Website.
 * @param {string=} options.subSource Defaults to "Pre-automation".
 * @param {string=} options.defaultEventType Used when a row does not say.
 * @param {number=} options.headerRow 1-based; auto-detected when omitted.
 * @param {boolean=} options.dryRun Report without writing anything.
 * @return {!Object} Summary of what happened, or would happen.
 */
function migrateExistingTab(options) {
  const opts = options || {};
  const startedAt = Date.now();
  const tabName = cleanText_(opts.tabName);
  if (!tabName) throw new Error('Choose which tab to migrate.');

  const sheet = getSpreadsheet_().getSheetByName(tabName);
  if (!sheet) throw new Error('No tab named "' + tabName + '" in this spreadsheet.');
  if (leadTabNames_().indexOf(tabName) === -1 && !confirmMigratable_(tabName)) {
    throw new Error('"' + tabName + '" is one of the automation\'s own tabs and cannot be migrated.');
  }

  const table = readTable_(sheet, Number(opts.headerRow) || 0);
  const summary = {
    tab: tabName,
    headerRow: table.headerRow,
    rows: table.rows.length,
    migrated: 0,
    alreadyDone: 0,
    empty: 0,
    duplicatesFound: 0,
    duplicates: [],
    ambiguousDates: [],
    stoppedEarly: false,
    remaining: 0,
    mapping: describeMigrationMapping_(sheet, table.headers),
    dryRun: !!opts.dryRun
  };
  if (!table.rows.length) return summary;

  const salesperson = cleanText_(opts.salesperson) || tabName;
  const source = cleanText_(opts.source) || SOURCES.website;
  const subSource = cleanText_(opts.subSource) || 'Pre-automation';
  const headers = table.headers.slice();

  const budgetMs = 1000 * numberSetting_(
    'Import Time Budget (seconds)', MIGRATE_TIME_BUDGET_SECONDS);

  const run = function () {
    if (!opts.dryRun) ensureHeaders_(sheet, LEAD_COLUMNS);

    const width = sheet.getLastColumn();
    const bound = fieldColumns_(sheet).byField;
    const sheetHeaders = sheet.getRange(1, 1, 1, width).getValues()[0]
      .map(function (h) { return cleanText_(h); });
    const allLeads = opts.dryRun ? null : getOrCreateSheet_(SHEETS.allLeads, LEAD_COLUMNS);
    const firstRow = table.headerRow + 1;
    const lastRow = sheet.getLastRow();

    // Rows are read and written a chunk at a time. Touching one cell per field
    // meant roughly fifty round trips per row, which runs out of Apps Script's
    // six minutes somewhere around row seventy.
    for (let start = firstRow; start <= lastRow; start += MIGRATE_CHUNK_ROWS) {
      if (Date.now() - startedAt >= budgetMs) {
        summary.stoppedEarly = true;
        summary.remaining = lastRow - start + 1;
        break;
      }

      const height = Math.min(MIGRATE_CHUNK_ROWS, lastRow - start + 1);
      const block = sheet.getRange(start, 1, height, width).getValues();
      const newAllLeads = [];
      const newDuplicates = [];
      let touched = false;

      block.forEach(function (values, i) {
        const rowNumber = start + i;

        const flat = {};
        sheetHeaders.forEach(function (header, c) {
          const value = values[c];
          if (!header || value === '' || value === null || value === undefined) return;
          const key = flat[header] === undefined ? header : header + ' (' + (c + 1) + ')';
          flat[key] = value;
        });
        if (!Object.keys(flat).length) {
          summary.empty++;
          return;
        }
        if (bound.leadId && cleanText_(values[bound.leadId - 1])) {
          summary.alreadyDone++;
          return;
        }

        const mapped = mapRecord_(flat);
        const lead = buildLead_({
          fields: mapped.fields,
          extras: mapped.extras,
          messages: mapped.messages,
          source: source,
          subSource: subSource,
          receivedAt: normalizeDate_(mapped.fields.receivedAt) || '',
          defaultEventType: opts.defaultEventType,
          // Historical rows often carry their own Source and Sub-Source columns,
          // and those are more accurate than anything chosen in the dialog.
          preferRecordSource: true,
          preferRecordSubSource: true
        });
        if (!lead.email && !lead.phone && !lead.fullName) {
          summary.empty++;
          return;
        }
        if (!cleanText_(lead.assignedTo)) lead.assignedTo = salesperson;

        const dateInfo = classifyDate_(mapped.fields.eventDate);
        if (dateInfo.status === 'ambiguous') {
          summary.ambiguousDates.push({
            row: rowNumber,
            name: lead.fullName || lead.email || lead.phone,
            value: dateInfo.original
          });
        }

        const duplicate = findDuplicate_(lead);
        if (duplicate) {
          summary.duplicatesFound++;
          summary.duplicates.push({
            row: rowNumber,
            name: lead.fullName || lead.email || lead.phone,
            matchedOn: duplicate.matchedOn,
            existsIn: duplicate.entry.tab
          });
        }

        summary.migrated++;
        if (opts.dryRun) return;

        applyMigratedRow_(values, bound, lead, dateInfo);
        touched = true;
        newAllLeads.push(leadToRow_(allLeads, lead));
        // Free keys still get indexed, so a row that duplicates another is at
        // least findable by whichever contact detail is unique to it.
        indexLead_(lead, tabName, rowNumber);
        if (duplicate) {
          newDuplicates.push(Object.assign({}, lead, {
            status: 'Duplicate (pre-existing row)',
            matchedOn: duplicate.matchedOn,
            originalLeadId: duplicate.entry.leadId,
            originalTab: duplicate.entry.tab
          }));
        }
      });

      if (opts.dryRun) continue;
      if (touched) sheet.getRange(start, 1, height, width).setValues(block);
      appendRows_(allLeads, newAllLeads);
      if (newDuplicates.length) {
        const dupSheet = getOrCreateSheet_(SHEETS.duplicates, LEAD_COLUMNS.concat(DUPLICATE_EXTRA_COLUMNS));
        appendRows_(dupSheet, newDuplicates.map(function (record) {
          return leadToRow_(dupSheet, record);
        }));
      }
      flushIndex_();
    }

    if (!opts.dryRun) flushSubSources_();
  };

  if (opts.dryRun) {
    run();
  } else {
    withLock_(run, 300000);
    protectTextColumns_(sheet);
  }

  log_('INFO', 'migrate', (opts.dryRun ? 'Previewed' : 'Migrated') + ' "' + tabName + '"', {
    rows: summary.rows, migrated: summary.migrated,
    alreadyDone: summary.alreadyDone, duplicatesFound: summary.duplicatesFound,
    ambiguousDates: summary.ambiguousDates.length,
    stoppedEarly: summary.stoppedEarly, remaining: summary.remaining
  });
  return summary;
}

/**
 * Explains where each of a tab's columns will actually end up.
 *
 * Not the same question as "what does this header mean". A tab that already
 * says "Guests" keeps using it, so telling someone that column maps to
 * "Guest Count" leaves them looking for a Guest Count column that will never
 * appear. This answers the question they are really asking.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {!Array<string>} headers
 * @return {!Object<string,string>}
 */
function describeMigrationMapping_(sheet, headers) {
  const bindings = fieldColumns_(sheet);
  const mapping = {};

  headers.forEach(function (header) {
    const text = cleanText_(header);
    if (!text) return;

    if (isNoiseKey_(text)) {
      mapping[text] = '(ignored)';
      return;
    }

    const match = matchField_(text);
    if (!match.field) {
      mapping[text] = 'kept in the notes';
      return;
    }

    const field = FIELD_TO_LEAD_PROPERTY[match.field] || match.field;
    const label = leadFieldLabel_(field) || humanizeKey_(field);
    const boundCol = bindings.byField[field];
    const boundHeader = boundCol ? cleanText_(bindings.headers[boundCol - 1]) : '';

    if (boundHeader && squashKey_(boundHeader) === squashKey_(text)) {
      mapping[text] = label + ' — stays in this column';
    } else if (field === 'message') {
      mapping[text] = 'Message — new column';
    } else if (boundHeader) {
      // Another column already serves this field, so this one's values are
      // kept in the notes rather than overwriting it.
      mapping[text] = 'kept in the notes ("' + boundHeader + '" is the ' + label + ')';
    } else {
      mapping[text] = label + ' — new column';
    }
  });

  return mapping;
}

let LEAD_FIELD_LABELS_ = null;

/** @return {string} The canonical column name for a lead field. */
function leadFieldLabel_(field) {
  if (!LEAD_FIELD_LABELS_) {
    LEAD_FIELD_LABELS_ = {};
    Object.keys(COLUMN_TO_FIELD).forEach(function (header) {
      const key = COLUMN_TO_FIELD[header];
      if (LEAD_FIELD_LABELS_[key] === undefined) LEAD_FIELD_LABELS_[key] = header;
    });
  }
  return LEAD_FIELD_LABELS_[field] || '';
}

/** @return {boolean} True when a tab is a salesperson tab rather than machinery. */
function confirmMigratable_(tabName) {
  const owned = [
    SHEETS.allLeads, SHEETS.duplicates, SHEETS.settings, SHEETS.team,
    SHEETS.sources, SHEETS.index, SHEETS.raw, SHEETS.log, 'Dashboard'
  ].map(squashKey_);
  return owned.indexOf(squashKey_(tabName)) === -1;
}

/**
 * Fills the canonical columns of one historical row, in memory.
 *
 * The row is a plain array read from the sheet and written back with its
 * chunk, so nothing here costs a round trip — which is the whole point.
 *
 * @param {!Array<*>} values The row, mutated in place.
 * @param {!Object<string,number>} bound Field name -> 1-based column.
 * @param {!Object} lead
 * @param {{status: string, value: string, original: string}} dateInfo
 */
function applyMigratedRow_(values, bound, lead, dateInfo) {
  const set = function (field, value) {
    const col = bound[field];
    if (!col) return;
    if (value === '' || value === null || value === undefined) return;
    values[col - 1] = value;
  };
  const fill = function (field, value) {
    const col = bound[field];
    if (!col) return;
    if (cleanText_(values[col - 1])) return;
    set(field, value);
  };

  // The only value that may replace one already in the sheet, and only when the
  // date reads one way. An ambiguous one stays exactly as typed and stands out
  // against the normalised rows around it — which is the point.
  if (dateInfo && dateInfo.status === 'iso' && settingIsOn_('Normalise Event Dates On Import')) {
    set('eventDate', dateInfo.value);
  }

  fill('presenter', lead.presenter);
  fill('leadId', lead.leadId);
  fill('receivedAt', lead.receivedAt);
  fill('source', lead.source);
  fill('subSource', lead.subSource);
  fill('eventTypeLabel', lead.eventTypeLabel);
  fill('eventTypeRaw', lead.eventTypeRaw);
  fill('fullName', lead.fullName);
  fill('firstName', lead.firstName);
  fill('lastName', lead.lastName);
  fill('company', lead.company);
  fill('eventDateRaw', dateInfo ? dateInfo.original : '');
  fill('guestCount', lead.guestCount);
  fill('venue', lead.venue);
  fill('budget', lead.budget);
  fill('message', lead.message);
  fill('campaign', lead.campaign);
  fill('assignedTo', lead.assignedTo);
  fill('status', lead.status);
  fill('touches', lead.touches);
  fill('firstSeenAt', lead.firstSeenAt);
  fill('lastTouchAt', lead.lastTouchAt);
  fill('allSubSources', lead.allSubSources);
}

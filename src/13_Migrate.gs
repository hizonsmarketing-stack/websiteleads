/**
 * One-time migration of leads that already sit in a salesperson's tab.
 *
 * Rows stay exactly where they are — whoever owns a lead keeps it. What the
 * migration adds is the canonical columns alongside the existing ones, filled
 * in from whatever those rows already say, plus a Lead ID and an entry in the
 * dedupe index. From then on a returning inquiry is recognised as the same
 * person and merged into the historical row instead of being dealt out again.
 *
 * Nothing is deleted and no row moves. The values overwritten are Email, Phone
 * and — only where it can be read with certainty — Event Date; the originals
 * are preserved in Phone (Raw) and Event Date (Raw). Every other canonical
 * column is filled only where it is blank.
 *
 * A date like "03/04/2027" that could be read either way round is left exactly
 * as typed and reported, because several people have typed into these columns
 * over the years and guessing would move real bookings by weeks.
 */

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
    mapping: describeMapping_(table.headers),
    dryRun: !!opts.dryRun
  };
  if (!table.rows.length) return summary;

  const salesperson = cleanText_(opts.salesperson) || tabName;
  const source = cleanText_(opts.source) || SOURCES.website;
  const subSource = cleanText_(opts.subSource) || 'Pre-automation';
  const headers = table.headers.slice();

  const run = function () {
    if (!opts.dryRun) ensureHeaders_(sheet, LEAD_COLUMNS);
    const idCol = headerMap_(sheet)[squashKey_('Lead ID')];

    table.rows.forEach(function (row, i) {
      const rowNumber = table.headerRow + 1 + i;

      const flat = {};
      headers.forEach(function (header, c) {
        const value = row[c];
        if (!header || value === '' || value === null || value === undefined) return;
        const key = flat[header] === undefined ? header : header + ' (' + (c + 1) + ')';
        flat[key] = value;
      });
      if (!Object.keys(flat).length) {
        summary.empty++;
        return;
      }

      const existingId = idCol ? cleanText_(sheet.getRange(rowNumber, idCol).getValue()) : '';
      if (existingId) {
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

      if (opts.dryRun) {
        summary.migrated++;
        return;
      }

      writeMigratedRow_(sheet, rowNumber, lead, dateInfo);
      appendLead_(getOrCreateSheet_(SHEETS.allLeads, LEAD_COLUMNS), lead);
      // Free keys still get indexed, so a row that duplicates another is at
      // least findable by whichever contact detail is unique to it.
      indexLead_(lead, tabName, rowNumber);
      if (duplicate) {
        recordDuplicate_(
          Object.assign({}, lead, { status: 'Duplicate (pre-existing row)' }),
          duplicate, duplicate.entry.leadId, duplicate.entry.tab
        );
      }
      summary.migrated++;
    });
  };

  if (opts.dryRun) run();
  else withLock_(run, 120000);

  log_('INFO', 'migrate', (opts.dryRun ? 'Previewed' : 'Migrated') + ' "' + tabName + '"', {
    rows: summary.rows, migrated: summary.migrated,
    alreadyDone: summary.alreadyDone, duplicatesFound: summary.duplicatesFound,
    ambiguousDates: summary.ambiguousDates.length
  });
  return summary;
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
 * Writes the canonical columns of one historical row.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNumber
 * @param {!Object} lead
 * @param {{status: string, value: string, original: string}} dateInfo
 */
function writeMigratedRow_(sheet, rowNumber, lead, dateInfo) {
  const map = headerMap_(sheet);
  const updates = {};

  // Normalised contact details replace what is there — matching depends on them.
  const overwrite = { 'Email': lead.email, 'Phone': lead.phone };

  // A date only gets rewritten when there is one way to read it. An ambiguous
  // one stays exactly as typed, and stands out against the normalised rows
  // around it — which is the point.
  if (dateInfo && dateInfo.status === 'iso') overwrite['Event Date'] = dateInfo.value;

  Object.keys(overwrite).forEach(function (header) {
    if (cleanText_(overwrite[header])) updates[header] = overwrite[header];
  });

  const fillIfBlank = {
    'Lead ID': lead.leadId,
    'Received At': lead.receivedAt,
    'Source': lead.source,
    'Sub-Source': lead.subSource,
    'Event Type': lead.eventTypeLabel,
    'Event Type (Raw)': lead.eventTypeRaw,
    'Full Name': lead.fullName,
    'First Name': lead.firstName,
    'Last Name': lead.lastName,
    'Phone (Raw)': lead.phoneRaw,
    'Company': lead.company,
    'Event Date (Raw)': dateInfo ? dateInfo.original : '',
    'Guest Count': lead.guestCount,
    'Venue / Location': lead.venue,
    'Budget': lead.budget,
    'Message': lead.message,
    'Campaign': lead.campaign,
    'Assigned To': lead.assignedTo,
    'Status': lead.status,
    'Touches': lead.touches,
    'First Seen At': lead.firstSeenAt,
    'Last Touch At': lead.lastTouchAt,
    'All Sub-Sources': lead.allSubSources
  };
  Object.keys(fillIfBlank).forEach(function (header) {
    const col = map[squashKey_(header)];
    if (!col) return;
    const value = fillIfBlank[header];
    if (value === '' || value === null || value === undefined) return;
    if (cleanText_(sheet.getRange(rowNumber, col).getValue())) return;
    updates[header] = value;
  });

  updateRowCells_(sheet, rowNumber, updates);
}

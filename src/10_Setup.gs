/**
 * One-time (and safely repeatable) workbook setup: creates every tab the
 * automation needs, seeds the settings, and applies the formatting the sales
 * team works in. Running it again on a populated workbook repairs structure
 * without touching data.
 */

/** Status values offered in the Status column. */
const STATUS_OPTIONS = [
  'New', 'Contacted', 'Qualified', 'Quoted', 'Booked', 'Lost',
  'Nurturing', 'Needs Contact Info', 'Duplicate'
];

/**
 * Creates or repairs every tab. Safe to run at any time.
 * @return {string} A human-readable summary.
 */
function setupWorkbook() {
  return withLock_(function () {
    SETTINGS_CACHE_ = null;
    const created = [];

    allEventTypes_().forEach(function (type) {
      const existed = !!getSpreadsheet_().getSheetByName(type.tab);
      const sheet = getOrCreateSheet_(type.tab, LEAD_COLUMNS);
      styleLeadSheet_(sheet);
      if (!existed) created.push(type.tab);
    });

    styleLeadSheet_(getOrCreateSheet_(SHEETS.allLeads, LEAD_COLUMNS));
    styleLeadSheet_(getOrCreateSheet_(SHEETS.duplicates, LEAD_COLUMNS.concat(DUPLICATE_EXTRA_COLUMNS)));

    getOrCreateSheet_(SHEETS.sources, SOURCES_COLUMNS);
    const detected = seedTeamTab_();
    getOrCreateSheet_(SHEETS.index, INDEX_COLUMNS);
    getOrCreateSheet_(SHEETS.raw, RAW_COLUMNS);
    getOrCreateSheet_(SHEETS.log, ['Timestamp', 'Level', 'Context', 'Message', 'Details']);

    seedSettings_();
    TEAM_CACHE_ = null;
    buildDashboard_();
    hideInternalTabs_();
    SETTINGS_CACHE_ = null;

    let message = created.length
      ? 'Setup complete. Created: ' + created.join(', ') + '.'
      : 'Setup complete. All tabs were already in place and have been checked.';
    if (detected.length) {
      message += '\n\nFound ' + detected.length + ' existing tab' +
        (detected.length === 1 ? '' : 's') + ' that could be salespeople:\n  ' +
        detected.join(', ') + '\n\nOpen the ' + SHEETS.team + ' tab, fill in each ' +
        'person\'s Event Types, and set Active to yes. Until then, leads go to the ' +
        'shared event-type tabs.';
    }
    log_('INFO', 'setup', message);
    return message;
  });
}

/**
 * Writes the _Settings tab, adding any missing keys without disturbing values
 * the team has already changed.
 */
function seedSettings_() {
  const sheet = getOrCreateSheet_(SHEETS.settings, ['Setting', 'Value', 'Notes']);

  const notes = {
    'Time Zone': 'Used for every timestamp written by the automation.',
    'Default Country Code': 'Digits only. Local numbers starting 09... become +63 9...',
    'Dedupe On': 'Comma separated: email, phone, date. Default email,phone.',
    'Dedupe Ignore Plus Tags': 'yes = maria+fair@gmail.com matches maria@gmail.com.',
    'Promote Unassigned Leads': 'yes = move a lead out of Unassigned once a later form reveals the event type.',
    'Append Duplicate Notes': 'yes = add the repeat inquiry text to the original lead’s Message.',
    'Normalise Event Dates On Import': 'yes = rewrite unambiguous dates as YYYY-MM-DD when importing an existing tab. no = leave every date exactly as typed.',
    'Accept Test Leads': 'yes = store Google Ads test leads instead of only acknowledging them.',
    'Round Robin Assignment': 'yes = share leads across the _Team roster.',
    'Presenters': 'The default repeating sequence down the Presenter column, in order. Overridden per event type below.',
    'Notify On New Lead': 'yes = email the assignee, and the Notify rows below, as each lead arrives.',
    'Digest Every N Leads': 'Send the sales team a summary email every this many new leads. 0 turns it off.',
    'Digest Recipients': 'Comma-separated addresses the digest goes to. Blank means it is never sent.',
    'Raw Payload Retention (rows)': 'Oldest rows in _Raw are trimmed beyond this count.',
    'Log Retention (rows)': 'Oldest rows in _Log are trimmed beyond this count.'
  };

  const wanted = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    wanted.push([key, DEFAULT_SETTINGS[key], notes[key] || '']);
  });
  teamTabNames_().forEach(function (tab) {
    wanted.push(['Notify - ' + tab, '',
      'Comma-separated addresses to copy on new ' + tab + ' leads, on top of the assignee.']);
  });
  EVENT_TYPES.forEach(function (type) {
    // Corporate is called and presented by the same two people, so the caller
    // presents their own. Everything else follows the general Presenters list.
    wanted.push([
      'Presenters - ' + type.label,
      type.key === 'corporate' ? 'caller' : '',
      'A sequence, or "caller" when the caller presents their own, or "none". ' +
        'Blank follows the Presenters row above.'
    ]);
  });

  const existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (row) {
      const key = cleanText_(row[0]);
      if (key) existing[key] = true;
    });
  }

  const missing = wanted.filter(function (row) { return !existing[row[0]]; });
  if (missing.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  }
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 520);
  sheet.getRange(1, 3, sheet.getMaxRows(), 1).setFontColor('#666666');
}

/**
 * Creates the _Team roster, and on first run pre-fills it with every tab that
 * looks like a salesperson's — anything the automation does not own. Rows land
 * inactive with no event types, so nothing is routed to a person until someone
 * has said who covers what.
 * @return {!Array<string>} Tab names newly added to the roster.
 */
function seedTeamTab_() {
  const sheet = getOrCreateSheet_(SHEETS.team, TEAM_COLUMNS);
  TEAM_CACHE_ = null;

  const owned = {};
  teamTabNames_().concat([
    SHEETS.allLeads, SHEETS.duplicates, SHEETS.settings, SHEETS.team,
    SHEETS.sources, SHEETS.index, SHEETS.raw, SHEETS.log, 'Dashboard'
  ]).forEach(function (name) { owned[squashKey_(name)] = true; });

  const listed = {};
  loadTeam_().forEach(function (member) { listed[squashKey_(member.tab)] = true; });

  const added = [];
  getSpreadsheet_().getSheets().forEach(function (candidate) {
    const name = candidate.getName();
    const key = squashKey_(name);
    if (owned[key] || listed[key]) return;
    sheet.appendRow([name, name, '', '', 'no', 0, '', 'Detected during setup — fill in Event Types and set Active to yes.']);
    added.push(name);
  });

  const eventLabels = allEventTypes_()
    .filter(function (t) { return t.key !== FALLBACK_EVENT_TYPE.key; })
    .map(function (t) { return t.label; });
  sheet.getRange(1, 1, 1, TEAM_COLUMNS.length).setValues([TEAM_COLUMNS]);
  formatHeaderRow_(sheet, TEAM_COLUMNS.length);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 320);
  sheet.setColumnWidth(4, 240);
  sheet.setColumnWidth(8, 380);
  const activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['yes', 'no'], true).setAllowInvalid(true).build();
  sheet.getRange(2, 5, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(activeRule);

  if (added.length) {
    log_('INFO', 'setup', 'Added tabs to the roster', { tabs: added, eventTypes: eventLabels });
  }
  TEAM_CACHE_ = null;
  return added;
}

/**
 * Applies the working formatting to a lead tab: sensible widths, wrapped
 * message text, a Status dropdown and alternating rows.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function styleLeadSheet_(sheet) {
  const map = headerMap_(sheet);
  const widths = {
    'Presenter': 110, 'Lead ID': 150, 'Received At': 140, 'Source': 100, 'Sub-Source': 190,
    'Event Type': 150, 'Event Type (Raw)': 150, 'Full Name': 180,
    'First Name': 120, 'Last Name': 130, 'Email': 230, 'Phone': 140,
    'Company': 170, 'Event Date': 110, 'Event Date (Raw)': 120, 'Guest Count': 100,
    'Venue / Location': 170, 'Budget': 120, 'Message': 320, 'Campaign': 130,
    'Assigned To': 130, 'Status': 130, 'Touches': 80, 'First Seen At': 140,
    'Last Touch At': 140, 'All Sub-Sources': 220, 'Raw Ref': 110,
    'Matched On': 150, 'Original Lead ID': 150, 'Original Tab': 130
  };
  Object.keys(widths).forEach(function (header) {
    const col = map[squashKey_(header)];
    if (col) sheet.setColumnWidth(col, widths[header]);
  });

  const messageCol = map[squashKey_('Message')];
  if (messageCol) {
    sheet.getRange(2, messageCol, sheet.getMaxRows() - 1, 1)
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  }

  const statusCol = map[squashKey_('Status')];
  if (statusCol) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_OPTIONS, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
  }

  protectTextColumns_(sheet);
  formatHeaderRow_(sheet, Math.max(sheet.getLastColumn(), 1));
  if (!sheet.getBandings().length) {
    sheet.getRange(1, 1, sheet.getMaxRows(), Math.max(sheet.getLastColumn(), 1))
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  }
}

/** Builds a live Dashboard tab of counts by team tab, source and status. */
function buildDashboard_() {
  const sheet = getOrCreateSheet_('Dashboard', ['Website Leads Automation']);
  sheet.clear();

  const all = a1SheetRef_(SHEETS.allLeads);
  const sourceCol = columnLetter_('Source');
  const subSourceCol = columnLetter_('Sub-Source');
  const statusCol = columnLetter_('Status');
  const eventTypeCol = columnLetter_('Event Type');
  const rows = [];
  rows.push(['Website Leads Automation', '', '']);
  rows.push(['Live counts from the ' + SHEETS.allLeads + ' tab.', '', '']);
  rows.push(['', '', '']);
  rows.push(['Leads by event type', 'Count', '']);
  teamTabNames_().forEach(function (tab) {
    rows.push([tab, '=IFERROR(COUNTIF(' + all + '!' + eventTypeCol + '2:' + eventTypeCol +
      ',"' + eventTypeByTab_(tab).label + '"),0)', '']);
  });
  rows.push(['', '', '']);
  rows.push(['Leads by salesperson', 'Count', '']);
  loadTeam_().forEach(function (member) {
    rows.push([member.name + (member.active ? '' : ' (inactive)'),
      '=IFERROR(COUNTA(' + a1SheetRef_(member.tab) + '!A2:A),0)', '']);
  });
  rows.push(['', '', '']);
  rows.push(['Totals', 'Count', '']);
  rows.push(['Total (all leads)', '=IFERROR(COUNTA(' + all + '!A2:A),0)', '']);
  rows.push(['Duplicates caught',
    '=IFERROR(COUNTA(' + a1SheetRef_(SHEETS.duplicates) + '!A2:A),0)', '']);
  rows.push(['', '', '']);
  rows.push(['Leads by source', 'Count', '']);
  Object.keys(SOURCES).forEach(function (key) {
    rows.push([SOURCES[key], '=IFERROR(COUNTIF(' + all + '!' + sourceCol + '2:' + sourceCol + ',"' + SOURCES[key] + '"),0)', '']);
  });
  rows.push(['', '', '']);
  rows.push(['Leads by status', 'Count', '']);
  STATUS_OPTIONS.forEach(function (status) {
    rows.push([status, '=IFERROR(COUNTIF(' + all + '!' + statusCol + '2:' + statusCol + ',"' + status + '"),0)', '']);
  });
  rows.push(['', '', '']);
  rows.push(['Leads by sub-source', '', '']);
  rows.push([
    '=IFERROR(QUERY(' + all + '!' + subSourceCol + '2:' + subSourceCol + ',"select ' + subSourceCol +
      ', count(' + subSourceCol + ') where ' + subSourceCol + ' is not null group by ' + subSourceCol +
      ' order by count(' + subSourceCol + ') desc label count(' + subSourceCol +
      ') \'\'Leads\'\'",0),"No leads yet")',
    '', ''
  ]);

  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  sheet.getRange('A1').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A2').setFontColor('#666666');
  sheet.getRange(1, 1, rows.length, 1).setFontWeight('normal');
  ['Leads by event type', 'Leads by salesperson', 'Totals', 'Leads by source',
   'Leads by status', 'Leads by sub-source'].forEach(function (label) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === label) {
        sheet.getRange(i + 1, 1, 1, 2).setFontWeight('bold').setBackground('#eef3f7');
      }
    }
  });
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 120);
  sheet.setFrozenRows(2);
  getSpreadsheet_().setActiveSheet(sheet);
  getSpreadsheet_().moveActiveSheet(1);
}

/**
 * Quotes a sheet name for use inside a formula. Apostrophes are doubled, so a
 * tab called Kid's Party becomes 'Kid''s Party' rather than breaking the
 * formula at the apostrophe.
 * @param {string} name
 * @return {string}
 */
function a1SheetRef_(name) {
  return "'" + String(name).replace(/'/g, "''") + "'";
}

/**
 * A1-notation column letter for a canonical column, so the Dashboard formulas
 * survive a change to the LEAD_COLUMNS order.
 * @param {string} header
 * @return {string}
 */
function columnLetter_(header) {
  let index = LEAD_COLUMNS.indexOf(header) + 1;
  if (index < 1) index = 1;
  let letter = '';
  while (index > 0) {
    const remainder = (index - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    index = Math.floor((index - 1) / 26);
  }
  return letter;
}

/** Hides the machinery tabs so the sales team sees only what they work in. */
function hideInternalTabs_() {
  [SHEETS.index, SHEETS.raw, SHEETS.log].forEach(function (name) {
    const sheet = getSpreadsheet_().getSheetByName(name);
    if (sheet && !sheet.isSheetHidden()) sheet.hideSheet();
  });
}

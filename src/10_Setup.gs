/**
 * One-time (and safely repeatable) workbook setup: creates every tab the
 * automation needs, seeds the settings, and applies the formatting the sales
 * team works in. Running it again on a populated workbook repairs structure
 * without touching data.
 */

/** Status values offered in the Status column. */
/**
 * What a caller can set the Status column to, in the order a lead moves.
 *
 * These are call dispositions rather than a sales pipeline: the caller's part
 * ends when the lead is handed on, and the presenter carries it from there.
 *
 * The team's own definitions, which are narrower than the words look:
 *
 *   New          Nobody has worked it yet.
 *   Valid        The client answered *and* has a real inquiry. Both, not
 *                either — a wrong number or somebody not actually asking
 *                about anything is not Valid.
 *   No Response  Tried three times and still nothing back.
 *   Lost         The client said no — found another caterer, or filled the
 *                form in by mistake — or the venue is too far to serve.
 *   Transferred  Moved to another team: socials to corporate or back, or
 *                handed to the food order team.
 *
 * The distinction worth keeping straight is Lost against No Response: Lost is
 * for a decision, whether the client's or ours. Not reaching someone is not a
 * decision.
 *
 * Renaming one of these changes both the dropdown on every lead tab and the
 * Dashboard's own rows, which read from this list. Leads already carrying the
 * old word keep it — the dropdown allows values outside the list on purpose —
 * so they need a find-and-replace, or they are counted under nothing.
 */
const STATUS_OPTIONS = ['New', 'Valid', 'No Response', 'Lost', 'Transferred'];

/**
 * Statuses the automation sets, which nobody picks from a dropdown.
 *
 * "Needs Contact Info" marks a submission that arrived with no email and no
 * phone — a form filled in with no way to reach the person. It is not a
 * disposition a caller chooses, but those leads still need to be visible, so
 * the Dashboard counts them alongside the list above.
 *
 * ("Duplicate" is written too, but only onto rows in the Duplicates tab, which
 * nobody works and the Dashboard does not count.)
 */
const AUTOMATIC_STATUSES = ['Needs Contact Info'];

/**
 * The fill a row takes once somebody has said where the lead stands.
 *
 * New is white on purpose rather than left alone: most rows are New at any
 * moment, so a plain ground is what makes the worked ones show up. Anything
 * without an entry here — "Needs Contact Info" — keeps the sheet's banding.
 *
 * Google's own light tints, so black text stays readable and the rows print.
 * Written as conditional formatting on each tab, which means a caller changing
 * the Status cell recolours the row that instant, with nothing to run.
 */
const STATUS_COLOURS = {
  'New': '#FFFFFF',
  'Valid': '#D9EAD3',
  'No Response': '#CFE2F3',
  'Lost': '#F4CCCC',
  'Transferred': '#D9D2E9',
  // Only ever written onto rows in the Duplicates tab.
  'Duplicate': '#FCE5CD'
};

/**
 * How the Dashboard splits a month into weeks.
 *
 * Calendar weeks would put a single month across five or six rows that start
 * on different days each month, which nobody can compare month to month. Days
 * of the month are steadier: the 1st to the 7th is always Week 1. The last
 * bucket runs to 31 so a long month has nowhere to hide — which does make it
 * ten days wide rather than seven, so it reads high by about a third.
 *
 * Counted on Received At, from the All Leads tab: one row per lead, and repeat
 * inquiries are filed in Duplicates rather than counted again here.
 */
const WEEK_BUCKETS = [
  { label: 'Week 1 (1-7)', from: 1, to: 7 },
  { label: 'Week 2 (8-14)', from: 8, to: 14 },
  { label: 'Week 3 (15-21)', from: 15, to: 21 },
  { label: 'Week 4 (22-31)', from: 22, to: 31 }
];

/**
 * Shorthand a caller might type instead of the full status.
 *
 * The Dashboard counts on exact text, so "NR" scribbled into the Status column
 * would otherwise fall under no row at all — the lead looks unworked in every
 * count while the caller believes they have marked it. Counting the shorthand
 * alongside the full word means the sheet reads what people actually write.
 *
 * Matching is Sheets' own, so it ignores case: "nr", "Nr" and "NR" all count.
 * These are deliberately not offered in the dropdown — one name per status
 * there, so nobody has to choose between two ways of saying the same thing.
 */
const STATUS_ALIASES = {
  'No Response': ['NR']
};

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

    clearSourceColours_(getOrCreateSheet_(SHEETS.sources, SOURCES_COLUMNS));
    const detected = seedTeamTab_();
    getOrCreateSheet_(SHEETS.index, INDEX_COLUMNS);
    getOrCreateSheet_(SHEETS.raw, RAW_COLUMNS);
    getOrCreateSheet_(SHEETS.log, ['Timestamp', 'Level', 'Context', 'Message', 'Details']);

    seedSettings_();
    TEAM_CACHE_ = null;
    const rosterTabs = createRosterTabs_();

    // Existing caller tabs carry the old source colouring too, so they need
    // clearing — setup only styles a roster tab on the run that creates it.
    loadTeam_().forEach(function (member) {
      if (!member.tab) return;
      const sheet = getSpreadsheet_().getSheetByName(member.tab);
      if (sheet) clearSourceColours_(sheet);
    });

    // Every tab somebody works a lead in, plus Duplicates, which is where the
    // Duplicate status is written. Not All Leads: its Status is the
    // automation's copy and does not follow a caller's edit, so colouring it
    // would dress a stale value up as a current one.
    leadTabNames_().concat([SHEETS.duplicates]).forEach(function (name) {
      const sheet = getSpreadsheet_().getSheetByName(name);
      if (sheet) applyStatusColours_(sheet);
    });
    buildDashboard_();
    hideInternalTabs_();
    SETTINGS_CACHE_ = null;

    let message = created.length
      ? 'Setup complete. Created: ' + created.join(', ') + '.'
      : 'Setup complete. All tabs were already in place and have been checked.';
    if (rosterTabs.length) {
      message += '\n\nCreated a tab for ' + rosterTabs.join(', ') + '.';
    }
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
    'Import Time Budget (seconds)': 'How long an import works before stopping cleanly and asking to be run again. Apps Script kills a run at 360.',
    'Accept Test Leads': 'yes = store Google Ads test leads instead of only acknowledging them.',
    'Round Robin Assignment': 'yes = share leads across the _Team roster.',
    'Presenters': 'The default repeating sequence down the Presenter column, in order. Overridden per event type below.',
    'Notify On New Lead': 'yes = email each caller when their tab has collected new leads. The Notify rows below are copied in.',
    'Notify Every N Leads': 'How many leads a tab collects before its caller is told. 5 keeps it to one mail a morning rather than one an hour; 1 tells them about every lead.',
    'Notify Unassigned To': 'Comma-separated addresses told when a lead arrives with no event type, so nobody has to watch the Unassigned tab. One mail per batch. Works whether or not "Notify On New Lead" is on; blank turns it off.',
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
 * Gives everyone active on the roster a tab to work in.
 *
 * On a spreadsheet that starts empty there is nothing for setup to detect, so
 * the roster is typed by hand and this turns it into tabs. Existing tabs are
 * left exactly as they are — no reformatting of a sheet a team already uses.
 *
 * @return {!Array<string>} Tab names newly created.
 */
function createRosterTabs_() {
  const created = [];
  loadTeam_().forEach(function (member) {
    if (!member.active || !member.tab) return;
    if (getSpreadsheet_().getSheetByName(member.tab)) return;
    styleLeadSheet_(getOrCreateSheet_(member.tab, LEAD_COLUMNS));
    created.push(member.tab);
  });
  if (created.length) log_('INFO', 'setup', 'Created roster tabs', { tabs: created });
  return created;
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
/**
 * Colours each row by what its Status column says.
 *
 * One conditional-format rule per status, spanning the whole row, so a caller
 * picking "Lost" from the dropdown turns that row red as they let go of the
 * mouse. The alternative — writing fills from the script — would only be right
 * until the next edit, and would need a trigger on every keystroke to stay so.
 *
 * Shorthand counts: the rule for a status matches every spelling in
 * STATUS_ALIASES too, so a row reading NR is as blue as one reading
 * No Response.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function applyStatusColours_(sheet) {
  const col = headerMap_(sheet)[squashKey_('Status')];
  if (!col) return;

  const letter = columnLetterFromIndex_(col);
  const width = Math.max(sheet.getLastColumn(), 1);
  const range = sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), width);

  // Ours come off first, so running setup again replaces the set instead of
  // stacking a second one behind it.
  const kept = sheet.getConditionalFormatRules().filter(function (rule) {
    return !isStatusColourRule_(rule);
  });

  const added = Object.keys(STATUS_COLOURS).map(function (status) {
    const spellings = [status].concat(STATUS_ALIASES[status] || []);
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(statusColourFormula_(letter, spellings))
      .setBackground(STATUS_COLOURS[status])
      .setRanges([range])
      .build();
  });

  // Ours go last, so a rule somebody set up for themselves still wins.
  sheet.setConditionalFormatRules(kept.concat(added));
}

/**
 * @param {string} letter Column letter of Status.
 * @param {!Array<string>} spellings Every wording that counts as this status.
 * @return {string} A conditional-format formula, relative to the first row.
 */
function statusColourFormula_(letter, spellings) {
  return '=OR(' + spellings.map(function (word) {
    return '$' + letter + '2="' + word + '"';
  }).join(',') + ')';
}

/** @return {boolean} Whether this rule is one applyStatusColours_ wrote. */
function isStatusColourRule_(rule) {
  const condition = rule.getBooleanCondition && rule.getBooleanCondition();
  const values = (condition && condition.getCriteriaValues()) || [];
  return values.some(function (value) {
    return Object.keys(STATUS_COLOURS).some(function (status) {
      return String(value).indexOf('2="' + status + '"') !== -1;
    });
  });
}

/**
 * Removes the Source colouring this script used to apply.
 *
 * The colours were dropped, but rules already written to a live workbook do not
 * disappear with the code — so setup clears them, and a single run tidies every
 * tab instead of someone deleting three rules per sheet by hand.
 *
 * Matched on the column and the condition rather than the rule's exact range: a
 * sheet grows as leads are appended, so the range recorded when the colouring
 * was applied no longer describes the same block of cells. A rule goes only if
 * it covers the Source column alone and tests for one of our own source names,
 * which is precisely what the colouring wrote. A team's own highlighting sits
 * on other columns or asks a different question, and stays.
 *
 * @param {!Sheet} sheet
 */
function clearSourceColours_(sheet) {
  const col = headerMap_(sheet)[squashKey_('Source')];
  if (!col) return;

  const ours = {};
  Object.keys(SOURCES).forEach(function (key) { ours[squashKey_(SOURCES[key])] = true; });

  const rules = sheet.getConditionalFormatRules();
  const kept = rules.filter(function (rule) {
    const onSourceColumn = rule.getRanges().some(function (r) {
      return r.getColumn() === col && r.getNumColumns() === 1;
    });
    if (!onSourceColumn) return true;

    const condition = rule.getBooleanCondition && rule.getBooleanCondition();
    const values = (condition && condition.getCriteriaValues()) || [];
    return !values.some(function (v) { return ours[squashKey_(v)]; });
  });

  if (kept.length !== rules.length) sheet.setConditionalFormatRules(kept);
}

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

  clearSourceColours_(sheet);
  protectTextColumns_(sheet);
  formatHeaderRow_(sheet, Math.max(sheet.getLastColumn(), 1));
  if (!sheet.getBandings().length) {
    sheet.getRange(1, 1, sheet.getMaxRows(), Math.max(sheet.getLastColumn(), 1))
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  }
}

/**
 * Counts the leads whose Received At falls on days `from` to `to` of whichever
 * month it is today.
 *
 * Received At is written as text — `yyyy-MM-dd HH:mm:ss` — but a column that
 * has been through a paste or an import can hold real date values in the same
 * rows, and a count that quietly skipped those would be worse than no count.
 * TEXT() formats a date and returns text unchanged, so the first ten
 * characters are `yyyy-mm-dd` either way. An empty cell formats as 1899, which
 * matches no month anyone is looking at, so blanks fall out on their own.
 *
 * @param {number} from First day of the month in this bucket.
 * @param {number} to Last day, inclusive.
 * @return {string} An A1 formula.
 */
function weekCountFormula_(from, to) {
  const col = columnLetter_('Received At');
  const range = a1SheetRef_(SHEETS.allLeads) + '!' + col + '2:' + col;
  return '=IFERROR(LET(' +
    'r,' + range + ',' +
    'd,LEFT(TEXT(r,"yyyy-mm-dd"),10),' +
    // "day" would collide with the DAY function, which LET will not allow.
    'dnum,IFERROR(VALUE(MID(d,9,2)),0),' +
    'SUMPRODUCT((LEFT(d,7)=TEXT(TODAY(),"yyyy-mm"))' +
      '*(dnum>=' + from + ')*(dnum<=' + to + '))' +
    '),0)';
}

/** Builds a live Dashboard tab of counts by team tab, source and status. */
function buildDashboard_() {
  const sheet = getOrCreateSheet_('Dashboard', ['Website Leads Automation']);
  sheet.clear();

  const all = a1SheetRef_(SHEETS.allLeads);
  const sourceCol = columnLetter_('Source');
  const subSourceCol = columnLetter_('Sub-Source');
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
  // The month names itself from a formula, so the block still reads correctly
  // in November without anyone re-running setup.
  rows.push(['Leads by week', 'Count', '=TEXT(TODAY(),"mmmm yyyy")']);
  WEEK_BUCKETS.forEach(function (bucket) {
    rows.push([bucket.label, weekCountFormula_(bucket.from, bucket.to), '']);
  });
  rows.push(['This month', weekCountFormula_(1, 31), '']);
  rows.push(['', '', '']);
  rows.push(['Leads by source', 'Count', '']);
  Object.keys(SOURCES).forEach(function (key) {
    rows.push([SOURCES[key], '=IFERROR(COUNTIF(' + all + '!' + sourceCol + '2:' + sourceCol + ',"' + SOURCES[key] + '"),0)', '']);
  });
  rows.push(['', '', '']);
  rows.push(['Leads by status', 'Count', '']);
  const statusRefs = statusCountRefs_();
  STATUS_OPTIONS.concat(AUTOMATIC_STATUSES).forEach(function (status) {
    // Counted across the tabs people actually work in, not the All Leads copy.
    const spellings = [status].concat(STATUS_ALIASES[status] || []);
    const terms = [];
    statusRefs.forEach(function (r) {
      spellings.forEach(function (spelling) {
        terms.push('COUNTIF(' + r.ref + '!' + r.letter + '2:' + r.letter +
          ',"' + spelling + '")');
      });
    });
    rows.push([status,
      terms.length ? '=IFERROR(' + terms.join('+') + ',0)' : 0, '']);
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
  ['Leads by event type', 'Leads by salesperson', 'Totals', 'Leads by week',
   'Leads by source', 'Leads by status', 'Leads by sub-source'].forEach(function (label) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === label) {
        sheet.getRange(i + 1, 1, 1, 2).setFontWeight('bold').setBackground('#eef3f7');
      }
    }
  });
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 150);
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
  const index = LEAD_COLUMNS.indexOf(header) + 1;
  return columnLetterFromIndex_(index < 1 ? 1 : index);
}

/**
 * A1 column letter for a 1-based column number.
 * @param {number} index
 * @return {string}
 */
function columnLetterFromIndex_(index) {
  let n = index;
  let letter = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * Every tab a lead can be sitting on, with that tab's own Status column.
 *
 * Status is the one column a person edits by hand, and they edit it where they
 * work — on their own tab. The All Leads copy is written when the lead arrives
 * and only ever updated by the automation itself, so counting statuses there
 * reports how leads looked on the day they landed, not where they are now.
 *
 * Each tab is asked for its own Status column rather than assumed: a team's
 * pre-existing tab keeps its own layout, and setup never restyles it.
 *
 * @return {!Array<{ref: string, letter: string}>}
 */
function statusCountRefs_() {
  const names = [];
  teamTabNames_().forEach(function (name) { names.push(name); });
  loadTeam_().forEach(function (member) {
    if (member.tab) names.push(member.tab);
  });

  const seen = {};
  const refs = [];
  names.forEach(function (name) {
    const key = squashKey_(name);
    if (seen[key]) return;
    seen[key] = true;
    const sheet = getSpreadsheet_().getSheetByName(name);
    if (!sheet) return;
    const col = fieldColumns_(sheet).byField['status'];
    if (!col) return;
    refs.push({ ref: a1SheetRef_(name), letter: columnLetterFromIndex_(col) });
  });
  return refs;
}

/** Hides the machinery tabs so the sales team sees only what they work in. */
function hideInternalTabs_() {
  [SHEETS.index, SHEETS.raw, SHEETS.log].forEach(function (name) {
    const sheet = getSpreadsheet_().getSheetByName(name);
    if (sheet && !sheet.isSheetHidden()) sheet.hideSheet();
  });
}

/**
 * The Leads menu the sales and marketing team actually uses.
 */

/** Adds the menu whenever the spreadsheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Leads')
    .addItem('Setup / repair tabs', 'menuSetup')
    .addSeparator()
    .addItem('Import bridal fair worksheet…', 'showFairImportDialog')
    .addSeparator()
    .addItem('Open team roster', 'menuOpenTeamRoster')
    .addItem('Import existing leads from a tab…', 'showMigrateDialog')
    .addSeparator()
    .addItem('Set web app URL…', 'menuSetWebAppUrl')
    .addItem('Show webhook URL', 'menuShowWebhookUrl')
    .addItem('Show last received payload', 'menuShowLastPayload')
    .addItem('Set webhook token…', 'menuSetWebhookToken')
    .addItem('Set Google Ads key…', 'menuSetGoogleAdsKey')
    .addSeparator()
    .addItem('Send lead digest now', 'menuSendDigest')
    .addSeparator()
    .addItem('Rebuild dedupe index', 'menuRebuildIndex')
    .addItem('Run self-test', 'menuRunTests')
    .addToUi();
}

/** Installable-trigger alias, for when the script is not container-bound. */
function onInstall(e) {
  onOpen(e);
}

function menuSetup() {
  const message = setupWorkbook();
  SpreadsheetApp.getUi().alert('Website Leads Automation', message, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Stores the deployed web-app URL, so the menu can print URLs that are ready
 * to paste rather than instructions for building one.
 */
function menuSetWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Web app URL',
    'In the Apps Script editor: Deploy > Manage deployments, and copy the ' +
    'Web app URL. It ends in /exec.\n\n' +
    'Paste just that address here — nothing after /exec. Everything the forms ' +
    'need is added for you afterwards.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const checked = checkWebAppUrl_(response.getResponseText());
  if (!checked.ok && !checked.url) {
    PropertiesService.getScriptProperties().deleteProperty('WEB_APP_URL');
    ui.alert('Cleared', 'The stored web app URL has been removed.', ui.ButtonSet.OK);
    return;
  }
  if (!checked.ok) {
    ui.alert('That does not look right', checked.problem, ui.ButtonSet.OK);
    return;
  }

  PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', checked.url);
  ui.alert('Saved', 'Now use Leads > Show webhook URL — it prints the ' +
    'addresses to paste into Wix and Google Ads.', ui.ButtonSet.OK);
}

function menuShowWebhookUrl() {
  const ui = SpreadsheetApp.getUi();
  const url = getWebhookUrl();
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('WEBHOOK_TOKEN') || '';
  const suffix = token ? '&token=' + encodeURIComponent(token) : '';

  if (!url) {
    ui.alert(
      'Not deployed yet',
      'Deploy the script first: Extensions > Apps Script > Deploy > New deployment > Web app, ' +
      'with "Execute as: Me" and "Who has access: Anyone".',
      ui.ButtonSet.OK
    );
    return;
  }

  // Read from a menu, Apps Script hands back the /dev URL. It is the test
  // endpoint: it answers you and 404s for everybody else, including Wix.
  if (isTestWebhookUrl_(url)) {
    ui.alert(
      'Tell me the live address first',
      'Apps Script only tells a menu about the /dev test URL, which answers you ' +
      'and returns 404 to everyone else — Wix included.\n\n' +
      'In the Apps Script editor: Deploy > Manage deployments, copy the Web app ' +
      'URL (it ends in /exec), then run Leads > Set web app URL… and paste it in.' +
      '\n\nAfter that this menu prints addresses ready to paste, with nothing ' +
      'left for you to assemble.',
      ui.ButtonSet.OK
    );
    return;
  }

  ui.alert(
    'Webhook URL',
    'Website forms — the same URL for every form, because Wix sends the form ' +
    'name and it becomes the sub-source:\n' +
    url + '?source=website' + suffix +
    '\n\nTo override the sub-source for one form, add &form=YOUR%20FORM%20NAME.' +
    '\n\nGoogle Ads lead forms:\n' + url + '?source=googleads' +
    '\n\nCheck it in a private / incognito window — logged in as yourself it can ' +
    'work even when nobody else can reach it. You should see {"status":"ok",…}. ' +
    'A sign-in page instead means "Who has access" is not set to Anyone.',
    ui.ButtonSet.OK
  );
}

/**
 * Menu action: print the most recent request exactly as it arrived.
 *
 * The first thing to reach for when a form submits but a field lands in the
 * wrong place: the alias dictionary can only match what was actually sent, and
 * the difference between what a form builder shows you and what it posts is
 * where the surprises live. Pretty-printed when it is JSON, raw otherwise.
 */
function menuShowLastPayload() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.raw);

  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert(
      'Nothing received yet',
      'No request has reached the webhook. Submit a test lead, then run this ' +
      'again. If a form has been submitted and nothing is here, the request ' +
      'never arrived — see the ' + SHEETS.log + ' tab.',
      ui.ButtonSet.OK
    );
    return;
  }

  const map = headerMap_(sheet);
  const row = sheet.getLastRow();
  const at = function (header) {
    const col = map[squashKey_(header)];
    return col ? String(sheet.getRange(row, col).getValue()) : '';
  };

  let body = at('Payload');
  try {
    body = JSON.stringify(JSON.parse(body), null, 2);
  } catch (err) {
    // Form-encoded or already plain text: show it as it came.
  }

  // The dialog is not a text editor; a very long payload is better truncated
  // than refused, and the whole thing is on the _Raw tab either way.
  const LIMIT = 12000;
  const clipped = body.length > LIMIT
    ? body.slice(0, LIMIT) + '\n\n… truncated. The whole payload is on the ' +
      SHEETS.raw + ' tab, row ' + row + '.'
    : body;

  ui.alert(
    'Last received payload',
    at('Ref') + ' · ' + at('Received At') + '\n' +
    at('Source') + ' / ' + at('Sub-Source') + '\n\n' + clipped,
    ui.ButtonSet.OK
  );
}

function menuSetWebhookToken() {
  const ui = SpreadsheetApp.getUi();
  // Nobody should have to invent a secret on the spot, so offer one.
  const suggestion = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  const response = ui.prompt(
    'Webhook token',
    'A secret you make up, which website forms then send as &token=… on the end ' +
    'of the URL. It is not something you look up anywhere — you decide it here ' +
    'and paste the same value into Wix.\n\n' +
    'Copy this one if you like:\n  ' + suggestion + '\n\n' +
    'Leave blank to clear it. With no token set, submissions are still accepted ' +
    'and a warning is logged.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const value = cleanText_(response.getResponseText());
  const props = PropertiesService.getScriptProperties();
  if (value) props.setProperty('WEBHOOK_TOKEN', value);
  else props.deleteProperty('WEBHOOK_TOKEN');
  ui.alert(
    'Saved',
    value
      ? 'Webhook token set. Every website form URL now needs &token=' + value +
        ' on the end of it — Leads > Show webhook URL prints the whole thing.'
      : 'Webhook token cleared. Submissions are accepted without one, and a ' +
        'warning is logged each time.',
    ui.ButtonSet.OK
  );
}

function menuSetGoogleAdsKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Google Ads key',
    'The "Key" value you entered on the Google Ads lead form webhook (leave blank to clear):',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const value = cleanText_(response.getResponseText());
  const props = PropertiesService.getScriptProperties();
  if (value) props.setProperty('GOOGLE_ADS_KEY', value);
  else props.deleteProperty('GOOGLE_ADS_KEY');
  ui.alert('Saved', value ? 'Google Ads key set.' : 'Google Ads key cleared.', ui.ButtonSet.OK);
}

function menuSendDigest() {
  SpreadsheetApp.getUi().alert('Lead digest', sendDigestNow(), SpreadsheetApp.getUi().ButtonSet.OK);
}

function menuRebuildIndex() {
  const count = rebuildIndex();
  SpreadsheetApp.getUi().alert(
    'Dedupe index rebuilt',
    'Indexed ' + count + ' lead' + (count === 1 ? '' : 's') + ' from the team tabs.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function menuRunTests() {
  const results = runSelfTest();
  const problems = results.roster.filter(function (line) { return line.indexOf('OK') !== 0; });
  const body = problems.length
    ? 'Fix these on the ' + SHEETS.team + ' tab:\n\n  • ' + problems.join('\n  • ') +
      '\n\nFull log in the ' + SHEETS.log + ' tab and the Apps Script execution log.'
    : results.roster.join('\n') +
      '\n\nFull log in the Apps Script execution log.';
  SpreadsheetApp.getUi().alert('Self-test — ' + results.summary, body, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Jumps to the _Team roster, creating it if this is the first time. */
function menuOpenTeamRoster() {
  const sheet = getOrCreateSheet_(SHEETS.team, TEAM_COLUMNS);
  getSpreadsheet_().setActiveSheet(sheet);
  const labels = allEventTypes_()
    .filter(function (t) { return t.key !== FALLBACK_EVENT_TYPE.key; })
    .map(function (t) { return t.label; });
  SpreadsheetApp.getUi().alert(
    'Team roster',
    'One row per salesperson.\n\n' +
    'Tab Name — the tab their leads go into.\n' +
    'Event Types — comma-separated, from: ' + labels.join(', ') + '\n' +
    '   (or * for everything)\n' +
    'Active — yes for anyone currently taking leads.\n\n' +
    'Leads are shared out evenly: whoever covers the event type and has the ' +
    'fewest so far gets the next one. Clear the Assigned Count column to ' +
    'restart the rotation.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/** Opens the migration dialog for pre-existing leads. */
function showMigrateDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Migrate')
    .setWidth(600)
    .setHeight(660);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import existing leads');
}

/**
 * Data the migration dialog needs.
 * @return {{tabs: !Array<string>, eventTypes: !Array<string>, sources: !Array<string>}}
 */
function getMigrateContext() {
  const machinery = {};
  [SHEETS.allLeads, SHEETS.duplicates, SHEETS.settings, SHEETS.team,
   SHEETS.sources, SHEETS.index, SHEETS.raw, SHEETS.log, 'Dashboard']
    .forEach(function (name) { machinery[name] = true; });

  return {
    tabs: getSpreadsheet_().getSheets()
      .map(function (s) { return s.getName(); })
      .filter(function (name) { return !machinery[name]; }),
    eventTypes: allEventTypes_().map(function (t) { return t.label; }),
    sources: [SOURCES.website, SOURCES.googleAds, SOURCES.exhibit]
  };
}

/** Dry run for the migration dialog. */
function previewMigration(form) {
  return migrateExistingTab(Object.assign({}, form, { dryRun: true }));
}

/** The real thing. */
function runMigration(form) {
  return migrateExistingTab(Object.assign({}, form, { dryRun: false }));
}

/** Opens the bridal-fair import dialog. */
function showFairImportDialog() {
  const html = HtmlService.createHtmlOutputFromFile('FairImport')
    .setWidth(560)
    .setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import bridal fair worksheet');
}

/**
 * Data the import dialog needs to render.
 * @return {{tabs: !Array<string>, eventTypes: !Array<string>}}
 */
function getImportContext() {
  const owned = {};
  leadTabNames_().concat([
    SHEETS.allLeads, SHEETS.duplicates, SHEETS.settings, SHEETS.team,
    SHEETS.sources, SHEETS.index, SHEETS.raw, SHEETS.log, 'Dashboard'
  ]).forEach(function (name) { owned[name] = true; });

  return {
    tabs: getSpreadsheet_().getSheets()
      .map(function (s) { return s.getName(); })
      .filter(function (name) { return !owned[name]; }),
    eventTypes: allEventTypes_().map(function (t) { return t.label; })
  };
}

/**
 * Reads the chosen worksheet and reports how its columns will be interpreted,
 * without importing anything.
 * @param {!Object} form Values from the dialog.
 * @return {{headerRow: number, rowCount: number, mapping: !Object<string,string>, sheetName: string}}
 */
function previewFairImport(form) {
  const sheet = resolveSourceSheet_({
    spreadsheetUrl: form.spreadsheetUrl,
    sheetName: form.sheetName
  });
  const table = readTable_(sheet, Number(form.headerRow) || 0);
  return {
    sheetName: sheet.getName(),
    headerRow: table.headerRow,
    rowCount: table.rows.length,
    mapping: describeMapping_(table.headers)
  };
}

/**
 * Runs the import for the dialog and returns a short report.
 * @param {!Object} form
 * @return {{summary: string, byTab: !Object<string,number>}}
 */
function runFairImport(form) {
  const summary = importFairWorksheet({
    spreadsheetUrl: form.spreadsheetUrl,
    sheetName: form.sheetName,
    fairName: form.fairName,
    fairDate: form.fairDate,
    defaultEventType: form.defaultEventType,
    headerRow: Number(form.headerRow) || 0
  });

  const parts = [
    summary.total + ' rows read from row ' + (summary.headerRow + 1) + ' down',
    summary.created + ' new leads',
    summary.merged + ' merged into existing leads',
    summary.skipped + ' skipped (no usable contact details)'
  ];
  return { summary: parts.join('\n'), byTab: summary.byTab };
}

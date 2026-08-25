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
    .addItem('Show webhook URL', 'menuShowWebhookUrl')
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

function menuShowWebhookUrl() {
  const ui = SpreadsheetApp.getUi();
  const url = getWebhookUrl();
  if (!url) {
    ui.alert(
      'Not deployed yet',
      'Deploy the script first: Extensions > Apps Script > Deploy > New deployment > Web app, ' +
      'with "Execute as: Me" and "Who has access: Anyone".',
      ui.ButtonSet.OK
    );
    return;
  }
  const token = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN') || '';
  const suffix = token ? '&token=' + encodeURIComponent(token) : '';
  ui.alert(
    'Webhook URL',
    'Website form:\n' + url + '?source=website&form=YOUR%20FORM%20NAME' + suffix +
    '\n\nGoogle Ads lead form:\n' + url + '?source=googleads' +
    '\n\nChange the form name for each different form — it becomes the sub-source.',
    ui.ButtonSet.OK
  );
}

function menuSetWebhookToken() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Webhook token',
    'Shared secret that website forms must send as &token=… (leave blank to clear):',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const value = cleanText_(response.getResponseText());
  const props = PropertiesService.getScriptProperties();
  if (value) props.setProperty('WEBHOOK_TOKEN', value);
  else props.deleteProperty('WEBHOOK_TOKEN');
  ui.alert('Saved', value ? 'Webhook token set.' : 'Webhook token cleared.', ui.ButtonSet.OK);
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

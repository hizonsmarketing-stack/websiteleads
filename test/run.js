/**
 * Runs the whole automation under Node against an in-memory stand-in for the
 * Google Sheets service (test/fakes.js). No Google account, no clasp push and
 * no live spreadsheet needed:
 *
 *   npm test
 *
 * Two layers run here: the same self-test the Leads menu exposes (pure
 * normalisation, mapping and routing logic), then end-to-end scenarios that
 * push real payloads through doPost and importFairWorksheet and assert on what
 * lands in the team tabs.
 */
const fs = require('fs');
const path = require('path');
const { installFakes } = require('./fakes.js');

const book = installFakes(global);
const dir = process.argv[2] || path.join(__dirname, '..', 'src');
const src = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort()
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
eval(src + '\n;global.__api = { setupWorkbook, doPost, importFairWorksheet, rebuildIndex, runSelfTest, resetCaches: function () { SETTINGS_CACHE_ = null; INDEX_CACHE_ = null; TEAM_CACHE_ = null; }, migrateExistingTab };');

const api = global.__api;

let failures = 0;
const quiet = process.argv.indexOf('--verbose') === -1;
const realLog = console.log;
function silence(on) { console.log = on ? function () {} : realLog; }

function check(name, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures++;
  realLog((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : `\n        expected: ${expected}\n        actual:   ${actual}`));
}
function post(body, params) {
  const res = api.doPost({ postData: { contents: JSON.stringify(body) }, parameter: params || {} });
  return JSON.parse(res.getContent());
}
function tab(name) { return book.getSheetByName(name); }
function rows(name) { const s = tab(name); return s ? Math.max(s.getLastRow() - 1, 0) : -1; }
function cellOf(sheetName, row, header) {
  const s = tab(sheetName);
  const headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  return s.getRange(row, headers.indexOf(header) + 1).getValue();
}

realLog('--- self-test (pure logic) ---');
silence(quiet);
const unit = api.runSelfTest();
silence(false);
realLog(unit.summary);
if (unit.failures) { realLog(unit.detail); failures += unit.failures; }

realLog('\n--- setup ---');
silence(quiet);
api.setupWorkbook();
['Wedding', 'Debut', "Kid's Party", 'Private Event', 'Corporate', 'Unassigned',
 'All Leads', 'Duplicates', '_Settings', '_Team', '_Sources', '_Index', '_Raw',
 '_Log', 'Dashboard'].forEach(name => {
  check('tab exists: ' + name, !!tab(name), 'true');
});
check('settings seeded', tab('_Settings').getLastRow() > 10, 'true');

realLog('\n--- website form: corporate lead ---');
let res = post({
  formName: 'Homepage Inquiry',
  data: {
    contact: { 'Full Name': 'ana reyes', 'Email Address': 'Ana.Reyes@example.com' },
    'Mobile Number': '0917 123 4567',
    'Type of Event': 'Company Christmas Party',
    'Number of Guests': 'around 250 pax',
    'Preferred Date': '12/20/2026',
    'How did you hear about us': 'Instagram'
  }
}, { source: 'website', form: 'Homepage Inquiry' });
check('website lead created', res.action, 'created');
check('routed to Corporate', res.tab, 'Corporate');
check('Corporate has 1 row', rows('Corporate'), 1);
check('source tagged', cellOf('Corporate', 2, 'Source'), 'Website');
check('sub-source tagged', cellOf('Corporate', 2, 'Sub-Source'), 'Homepage Inquiry');
check('name tidied', cellOf('Corporate', 2, 'Full Name'), 'Ana Reyes');
check('phone normalised', cellOf('Corporate', 2, 'Phone'), '+639171234567');
check('email lowercased', cellOf('Corporate', 2, 'Email'), 'ana.reyes@example.com');
check('guests parsed', cellOf('Corporate', 2, 'Guest Count'), '250');
check('date parsed', cellOf('Corporate', 2, 'Event Date'), '2026-12-20');
check('unmapped answer kept in Message',
  /How Did You Hear About Us: Instagram/.test(String(cellOf('Corporate', 2, 'Message'))), 'true');
check('All Leads mirrors it', rows('All Leads'), 1);

realLog('\n--- google ads: same person, phone match ---');
global.__setNow(new Date('2026-08-24T09:30:00'));
res = post({
  lead_id: 'gads-1',
  form_id: 4242,
  campaign_id: 777,
  api_version: '1.0',
  is_test: false,
  user_column_data: [
    { column_id: 'FULL_NAME', column_name: 'Full Name', string_value: 'Ana Reyes' },
    { column_id: 'PHONE_NUMBER', column_name: 'Phone Number', string_value: '+63 917 123 4567' },
    { column_id: 'What is the occasion?', column_name: 'What is the occasion?', string_value: 'Corporate event' },
    { column_id: 'COMPANY_NAME', column_name: 'Company Name', string_value: 'Acme Foods Inc.' }
  ]
}, { source: 'googleads' });
check('duplicate merged', res.action, 'merged');
check('Corporate still 1 row', rows('Corporate'), 1);
check('touch counted', cellOf('Corporate', 2, 'Touches'), 2);
check('both sub-sources recorded',
  String(cellOf('Corporate', 2, 'All Sub-Sources')), 'Homepage Inquiry | Google Ads Form 4242');
check('blank company filled from repeat', cellOf('Corporate', 2, 'Company'), 'Acme Foods Inc.');
check('original email preserved', cellOf('Corporate', 2, 'Email'), 'ana.reyes@example.com');
check('duplicate filed', rows('Duplicates'), 1);
check('duplicate says how it matched', cellOf('Duplicates', 2, 'Matched On'), 'Phone');
check('Google Ads sub-source registered',
  tab('_Sources').getRange(3, 2).getValue(), 'Google Ads Form 4242');

realLog('\n--- google ads test lead is acknowledged, not stored ---');
res = post({ lead_id: 'x', is_test: true, user_column_data: [
  { column_id: 'EMAIL', column_name: 'Email', string_value: 'test@test.com' }] }, { source: 'googleads' });
check('test lead not stored', res.message, 'test lead acknowledged');
check('All Leads unchanged', rows('All Leads'), 1);

realLog('\n--- form with no event type lands in Unassigned, then gets promoted ---');
global.__setNow(new Date('2026-08-25T11:00:00'));
res = post({ formName: 'Footer Newsletter', name: 'Jose Rizal', email: 'jose@example.com' },
  { source: 'website', form: 'Footer Newsletter' });
check('no event type -> Unassigned', res.tab, 'Unassigned');
res = post({
  formName: 'Wedding Package Inquiry', name: 'Jose Rizal', email: 'jose@example.com',
  'Type of Event': 'Church Wedding', 'Contact No.': '0918 765 4321'
}, { source: 'website', form: 'Wedding Package Inquiry' });
check('promoted on second submission', res.action, 'merged+promoted');
check('now in Wedding', res.tab, 'Wedding');
check('Unassigned emptied', rows('Unassigned'), 0);
check('Wedding has the lead', rows('Wedding'), 1);
check('phone captured on promotion', cellOf('Wedding', 2, 'Phone'), '+639187654321');
check('All Leads event type updated', cellOf('All Leads', 3, 'Event Type'), 'Wedding');

realLog('\n--- a third form matching the promoted lead by its new phone ---');
res = post({ formName: 'Contact Us', 'Contact Number': '09187654321', 'Name': 'J. Rizal' },
  { source: 'website', form: 'Contact Us' });
check('matched by newly learned phone', res.action, 'merged');
check('still one wedding row', rows('Wedding'), 1);
check('touches now 3', cellOf('Wedding', 2, 'Touches'), 3);

realLog('\n--- bridal fair worksheet import ---');
const fair = book.insertSheet('Organiser Export');
const fairData = [
  ['Wedding Expo Manila 2026 — Exhibitor Leads', '', '', '', ''],
  ['Booth 14 · Hall B', '', '', '', ''],
  ['', '', '', '', ''],
  ['Name', 'Contact No.', 'Email Address', 'Wedding Date', 'Remarks'],
  ['Liza Manalo', '0917 555 1234', 'liza@example.com', '02/14/2027', 'Wants a garden setup'],
  ['ANA REYES', '0917 123 4567', '', '', 'Already talked to us online'],
  ['Mark Chua', '0999 888 7777', 'mark@example.com', '11/05/2027', 'Corporate anniversary too'],
  ['', '', '', '', ''],
  ['No Contact Person', '', '', '', 'walked past the booth']
];
fair.getRange(1, 1, fairData.length, 5).setValues(fairData);

const summary = importFairWorksheet({
  sheetName: 'Organiser Export',
  fairName: 'Wedding Expo Manila 2026',
  fairDate: '2026-08-15',
  defaultEventType: 'Wedding'
});
check('header row detected below the title rows', summary.headerRow, 4);
check('blank row inside the data dropped', summary.total, 4);
check('new leads created', summary.created, 3);
check('existing lead merged', summary.merged, 1);
check('nothing skipped', summary.skipped, 0);
check('fair leads tagged Exhibit', cellOf('Wedding', 3, 'Source'), 'Exhibit');
check('fair name is the sub-source', cellOf('Wedding', 3, 'Sub-Source'), 'Wedding Expo Manila 2026');
check('fair default event type applied', cellOf('Wedding', 3, 'Event Type'), 'Wedding');
check('received date from the fair', String(cellOf('Wedding', 3, 'Received At')).slice(0, 10), '2026-08-15');
check('Ana merged not duplicated', rows('Corporate'), 1);
check('Ana touched a third time', cellOf('Corporate', 2, 'Touches'), 3);
check('unknown "Wedding Date" column read as the event date',
  cellOf('Wedding', 3, 'Event Date'), '2027-02-14');
check('remarks landed in Message',
  /garden setup/.test(String(cellOf('Wedding', 3, 'Message'))), 'true');
check('name-only row still captured', rows('Wedding') >= 4, 'true');
check('name-only row flagged',
  String(cellOf('Wedding', rows('Wedding') + 1, 'Status')), 'Needs Contact Info');

realLog('\n--- index integrity ---');
const indexed = api.rebuildIndex();
check('rebuild finds every lead', indexed, rows('All Leads'));
check('index still resolves after rebuild', tab('_Index').getLastRow() > 1, 'true');
res = post({ formName: 'Contact Us', email: 'liza@example.com', name: 'Liza M' },
  { source: 'website', form: 'Contact Us' });
check('dedupe works after a rebuild', res.action, 'merged');

realLog('\n--- salesperson roster: routing to people, not just teams ---');
silence(quiet);
function setSetting(key, value) {
  const sheet = tab('_Settings');
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === key) { sheet.getRange(i + 2, 2).setValue(value); return; }
  }
  throw new Error('no such setting: ' + key);
}

// Two teams, mirroring a tab-per-salesperson worksheet: five people covering
// socials/weddings/private events, two covering corporate.
const socials = "Wedding, Debut, Kid's Party, Private Event";
[
  ['Bea', 'Bea', socials, 'bea@example.com', 'yes', 0, '', ''],
  ['Carlo', 'Carlo', socials, '', 'yes', 0, '', ''],
  ['Dina', 'Dina', socials, '', 'yes', 0, '', ''],
  ['Ella', 'Ella', socials, '', 'no', 0, '', 'on leave'],
  ['Fred', 'Fred', socials, '', 'yes', 0, '', ''],
  ['Gina', 'Gina', 'Corporate', '', 'yes', 0, '', ''],
  ['Hector', 'Hector', 'Corporate', '', 'yes', 0, '', '']
].forEach(row => tab('_Team').appendRow(row));
setSetting('Notify On New Lead', 'yes');
api.resetCaches();

function inquiry(name, email, phone, eventType, form) {
  api.resetCaches();
  return post({ formName: form || 'Homepage Inquiry', name: name, email: email,
    'Contact Number': phone, 'Type of Event': eventType },
    { source: 'website', form: form || 'Homepage Inquiry' });
}

const c1 = inquiry('Corp One', 'c1@example.com', '0917 000 0001', 'Corporate seminar');
const c2 = inquiry('Corp Two', 'c2@example.com', '0917 000 0002', 'Corporate seminar');
const c3 = inquiry('Corp Three', 'c3@example.com', '0917 000 0003', 'Corporate seminar');
check('corporate lead goes to a person tab', c1.tab, 'Gina');
check('second corporate lead goes to the other rep', c2.tab, 'Hector');
check('third comes back around', c3.tab, 'Gina');
check('assignee stamped on the row', cellOf('Gina', 2, 'Assigned To'), 'Gina');

const s1 = inquiry('Soc One', 's1@example.com', '0917 111 0001', 'Debut');
const s2 = inquiry('Soc Two', 's2@example.com', '0917 111 0002', 'Church Wedding');
const s3 = inquiry('Soc Three', 's3@example.com', '0917 111 0003', 'Kiddie Party');
const s4 = inquiry('Soc Four', 's4@example.com', '0917 111 0004', 'Intimate family gathering');
check('socials team covers debut', ['Bea', 'Carlo', 'Dina', 'Fred'].indexOf(s1.tab) > -1, 'true');
check('same rotation covers weddings', ['Bea', 'Carlo', 'Dina', 'Fred'].indexOf(s2.tab) > -1, 'true');
check("and kid's parties", ['Bea', 'Carlo', 'Dina', 'Fred'].indexOf(s3.tab) > -1, 'true');
check('and private events', ['Bea', 'Carlo', 'Dina', 'Fred'].indexOf(s4.tab) > -1, 'true');
const socialTabs = [s1.tab, s2.tab, s3.tab, s4.tab];
check('four leads went to four different people', new Set(socialTabs).size, 4);
check('inactive rep skipped', socialTabs.indexOf('Ella'), -1);
check('roster counts kept', tab('_Team').getRange(2, 6).getValue(), 1);
check('assignee emailed', global.__mails.some(m => m.to.indexOf('bea@example.com') > -1), 'true');

api.resetCaches();
const rosterOk = api.runSelfTest().roster;
check('a complete roster reports clean',
  rosterOk.every(line => line.indexOf('OK') === 0), 'true');
check('and says who covers corporate',
  rosterOk.some(line => /Corporate: Gina, Hector/.test(line)), 'true');
check('inactive rep left out of the coverage list',
  rosterOk.some(line => /Ella/.test(line)), 'false');

tab('_Team').getRange(2, 3).setValue("Wedding, Debutt, Kid's Party, Private Event");
api.resetCaches();
check('a misspelled event type is caught',
  api.runSelfTest().roster.some(line => /Debutt/.test(line)), 'true');

// Rows 7 and 8 are the two corporate reps; stand them both down.
tab('_Team').getRange(7, 5, 2, 1).setValues([['no'], ['no']]);
tab('_Team').getRange(2, 3).setValue(socials);
api.resetCaches();
check('an event type nobody covers is caught',
  api.runSelfTest().roster.some(line => /Nobody active covers Corporate/.test(line)), 'true');
tab('_Team').getRange(7, 5, 2, 1).setValues([['yes'], ['yes']]);
api.resetCaches();

api.resetCaches();
const repeat = post({ formName: 'Wedding Package Inquiry', name: 'Soc One',
  email: 's1@example.com', 'Type of Event': 'Wedding' },
  { source: 'website', form: 'Wedding Package Inquiry' });
check('a returning lead stays with the rep who owns it', repeat.tab, s1.tab);
check('and is not re-dealt', repeat.action, 'merged');

api.resetCaches();
const noType = post({ formName: 'Footer Newsletter', name: 'Later Reveal',
  email: 'later@example.com' }, { source: 'website', form: 'Footer Newsletter' });
check('unknown event type stays unassigned', noType.tab, 'Unassigned');
check('and gets no owner', cellOf('Unassigned', 2, 'Assigned To'), '');
api.resetCaches();
const revealed = post({ formName: 'Corporate Events Inquiry', name: 'Later Reveal',
  email: 'later@example.com', 'Type of Event': 'Corporate' },
  { source: 'website', form: 'Corporate Events Inquiry' });
check('promotion hands it to a corporate rep', ['Gina', 'Hector'].indexOf(revealed.tab) > -1, 'true');
check('promoted row carries the owner', cellOf(revealed.tab, 3, 'Assigned To'), revealed.tab);

realLog('\n--- migrating a salesperson tab that already had leads ---');
silence(quiet);
const legacy = book.insertSheet('Iris');
const legacyData = [
  ['Client Name', 'Contact', 'Email Add', 'Type of Event', 'Date of Event', 'Status', 'Remarks'],
  ['Rosa Lim', '0917 999 0001', 'rosa@example.com', 'Debut', '03/15/2027', 'Quoted', 'wants buffet'],
  ['Ana Reyes', '0917 123 4567', '', 'Corporate', '', 'Contacted', 'from the website last year'],
  ['Ben Cruz', '0918 999 0002', 'ben@example.com', 'Wedding', '06/06/2027', '', '']
];
legacy.getRange(1, 1, legacyData.length, 7).setValues(legacyData);
tab('_Team').appendRow(['Iris', 'Iris', socials, '', 'yes', 0, '', '']);
api.resetCaches();

const dry = api.migrateExistingTab({ tabName: 'Iris', dryRun: true });
check('dry run reads every row', dry.migrated, 3);
check('dry run writes nothing', tab('Iris').getLastColumn(), 7);
check('dry run spots the cross-tab duplicate', dry.duplicatesFound, 1);

const migrated = api.migrateExistingTab({ tabName: 'Iris', subSource: 'Pre-automation' });
check('rows migrated', migrated.migrated, 3);
check('rows stayed in Iris', rows('Iris'), 3);
check('lead ids written', String(cellOf('Iris', 2, 'Lead ID')).slice(0, 3), 'LD-');
check('owner stamped from the tab', cellOf('Iris', 2, 'Assigned To'), 'Iris');
check('phone normalised in place', cellOf('Iris', 2, 'Phone'), '+639179990001');
check('original phone kept', cellOf('Iris', 2, 'Phone (Raw)'), '0917 999 0001');
check('legacy column untouched', cellOf('Iris', 2, 'Contact'), '0917 999 0001');
check('existing status preserved', cellOf('Iris', 2, 'Status'), 'Quoted');
check('event type read from the legacy column', cellOf('Iris', 2, 'Event Type'), 'Debut');
check('event date parsed', cellOf('Iris', 2, 'Event Date'), '2027-03-15');
check('tagged with the migration sub-source', cellOf('Iris', 2, 'Sub-Source'), 'Pre-automation');

api.resetCaches();
const returning = post({ formName: 'Contact Us', name: 'Rosa Lim', email: 'rosa@example.com',
  'Type of Event': 'Debut' }, { source: 'website', form: 'Contact Us' });
check('a migrated lead now dedupes against new inquiries', returning.action, 'merged');
check('and stays in its own tab', returning.tab, 'Iris');
check('touch counted on the historical row', cellOf('Iris', 2, 'Touches'), 2);

api.resetCaches();
const second = api.migrateExistingTab({ tabName: 'Iris' });
check('re-running the migration is a no-op', second.migrated, 0);
check('already-migrated rows are recognised', second.alreadyDone, 3);

realLog('\n--- auth and payload shapes ---');
silence(quiet);
PropertiesService.getScriptProperties().setProperty('WEBHOOK_TOKEN', 's3cret');
api.resetCaches();
let denied = post({ formName: 'Contact Us', email: 'nope@example.com' }, { source: 'website' });
check('bad token rejected', denied.status, 'error');
let allowed = post({ formName: 'Contact Us', email: 'yes@example.com', name: 'Token Test',
  'Type of Event': 'Corporate' }, { source: 'website', token: 's3cret' });
check('good token accepted', allowed.action, 'created');
PropertiesService.getScriptProperties().deleteProperty('WEBHOOK_TOKEN');

api.resetCaches();
const formEncoded = api.doPost({
  postData: { contents: 'name=Form+Encoded&email=fe%40example.com' },
  parameter: { source: 'website', form: 'Legacy HTML Form', name: 'Form Encoded',
    email: 'fe@example.com', 'Type of Event': 'Corporate' }
});
check('form-encoded body accepted', JSON.parse(formEncoded.getContent()).action, 'created');

realLog('\n--- totals ---');
realLog('  All Leads:      ' + rows('All Leads'));
realLog('  Wedding:        ' + rows('Wedding'));
realLog('  Debut:          ' + rows('Debut'));
realLog("  Kid's Party:    " + rows("Kid's Party"));
realLog('  Private Event:  ' + rows('Private Event'));
realLog('  Corporate:      ' + rows('Corporate'));
realLog('  Unassigned:     ' + rows('Unassigned'));
realLog('  Duplicates:     ' + rows('Duplicates'));
realLog('  _Sources:       ' + rows('_Sources'));

silence(false);
realLog('\n' + (failures ? failures + ' CHECKS FAILED' : 'All end-to-end checks passed.'));
process.exit(failures ? 1 : 0);

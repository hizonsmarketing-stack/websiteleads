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
eval(src + '\n;global.__api = { setupWorkbook, doPost, importFairWorksheet, rebuildIndex, runSelfTest, resetCaches: function () { SETTINGS_CACHE_ = null; INDEX_CACHE_ = null; TEAM_CACHE_ = null; }, migrateExistingTab, fieldColumns_, COLUMN_TO_FIELD, sendDigestNow, buildDigest_, moveLead, loadTeam_, readLeadRow_, WEEK_BUCKETS };');

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
  const squash = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '');
  let col = headers.map(squash).indexOf(squash(header));
  if (col === -1) {
    // The sheet may serve this field under its own name — "Contact number"
    // for Phone — exactly as the automation resolves it.
    const field = api.COLUMN_TO_FIELD[header];
    const bound = field ? api.fieldColumns_(s).byField[field] : 0;
    if (bound) col = bound - 1;
  }
  if (col === -1) throw new Error('no column "' + header + '" on ' + sheetName);
  return s.getRange(row, col + 1).getValue();
}

/** The caller's own edit: writes one named column on a row. */
function setCellOf(sheetName, row, header, value) {
  const s = tab(sheetName);
  const field = api.COLUMN_TO_FIELD[header];
  const col = field ? api.fieldColumns_(s).byField[field] : 0;
  if (!col) throw new Error('no column "' + header + '" on ' + sheetName);
  s.getRange(row, col).setValue(value);
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
check('phone stored as typed', cellOf('Corporate', 2, 'Phone'), '0917 123 4567');
check('email stored as typed', cellOf('Corporate', 2, 'Email'), 'Ana.Reyes@example.com');
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
check('original email untouched by the merge',
  cellOf('Corporate', 2, 'Email'), 'Ana.Reyes@example.com');
check('duplicate filed', rows('Duplicates'), 1);
check('duplicate says how it matched', cellOf('Duplicates', 2, 'Matched On'), 'Phone');

// Storing contact details as typed must not cost us the matching.
api.resetCaches();
const shouty = post({ formName: 'Contact Us', name: 'Ana Reyes',
  email: 'ANA.REYES@EXAMPLE.COM' }, { source: 'website', form: 'Contact Us' });
check('a differently capitalised email is the same person', shouty.action, 'merged');
api.resetCaches();
const spaced = post({ formName: 'Contact Us', name: 'Ana Reyes',
  'Contact Number': '(0917) 123-4567' }, { source: 'website', form: 'Contact Us' });
check('a differently punctuated phone is the same person', spaced.action, 'merged');
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
check('phone captured on promotion', cellOf('Wedding', 2, 'Phone'), '0918 765 4321');
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
check('every touch on Ana counted', cellOf('Corporate', 2, 'Touches'), 5);
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
check('presenter column leads the row', tab('Gina').getRange(1, 1).getValue(), 'Presenter');
// Corporate is called and presented by the same people.
check('a corporate caller presents their own', cellOf('Gina', 2, 'Presenter'), 'Gina');
check('on every one of their rows', cellOf('Gina', 3, 'Presenter'), 'Gina');
check('and the other corporate caller likewise', cellOf('Hector', 2, 'Presenter'), 'Hector');

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
check('no alert while every tab is under the threshold',
  global.__mails.some(m => m.to.indexOf('bea@example.com') > -1), 'false');

// --- the per-tab alert fires on the fifth, and covers all five -------------
realLog('\n--- new-lead alerts, batched per caller ---');
setSetting('Notify On New Lead', 'yes');
api.resetCaches();
function alertLead(i) {
  api.resetCaches();
  post({ formName: 'Homepage Inquiry', name: 'Alert ' + i, email: 'alert' + i + '@example.com',
    'Contact Number': '0917 44' + (4000 + i), 'Type of Event': 'Church Wedding' },
    { source: 'website', form: 'Homepage Inquiry' });
}
// The first lead per tab only seeds that tab's marker — switching alerts on
// must not mail anyone their back catalogue.
for (let i = 1; i <= 4; i++) alertLead(i);
const beaBefore = global.__mails.length;
check('turning alerts on does not mail the back catalogue',
  global.__mails.filter(m => /^\[\d+ new lead/.test(m.subject)).length, 0);
// Weddings are shared by four callers, so twenty more puts five on each tab.
for (let i = 5; i <= 24; i++) alertLead(i);
const notices = global.__mails.filter(m => /^\[\d+ new lead/.test(m.subject));
check('a tab reaching five is told', notices.length > 0, 'true');
check('and the mail covers the batch, not one lead',
  /^\[5 new leads\]/.test(notices[0].subject), 'true');
check('the tab is named in the subject', /waiting on /.test(notices[0].subject), 'true');
setSetting('Notify On New Lead', 'no');
api.resetCaches();
// Everything that is not corporate runs the AJ / Pam / Mhay / Vanessa sequence.
check('a non-corporate lead starts the sequence', cellOf(s1.tab, 2, 'Presenter'), 'AJ');
check('and so does the first lead in another tab', cellOf(s2.tab, 2, 'Presenter'), 'AJ');
const s5 = inquiry('Soc Five', 's5@example.com', '0917 111 0005', 'Wedding');
check('the second lead in a tab moves down the sequence',
  cellOf(s5.tab, 3, 'Presenter'), 'Pam');
check('the presenter sequence never touches corporate',
  ['AJ', 'Pam', 'Mhay', 'Vanessa'].indexOf(String(cellOf('Gina', 2, 'Presenter'))), -1);

api.resetCaches();
const rosterOk = api.runSelfTest().roster;
check('a complete roster reports clean',
  rosterOk.every(line => line.indexOf('OK') === 0), 'true');
check('and says who calls corporate',
  rosterOk.some(line => /Corporate: called by Gina, Hector/.test(line)), 'true');
check('and that corporate callers present their own',
  rosterOk.some(line => /Corporate:.*presented by the caller/.test(line)), 'true');
check('and spells out the sequence for the rest',
  rosterOk.some(line => /Wedding:.*presented by AJ → Pam → Mhay → Vanessa/.test(line)), 'true');
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
check('a promoted corporate lead is presented by its caller',
  cellOf(revealed.tab, 3, 'Presenter'), revealed.tab);

realLog('\n--- migrating a salesperson tab that already had leads ---');
silence(quiet);
const legacy = book.insertSheet('Iris');
// The real column set from a salesperson's tab, spelling and casing included.
const legacyData = [
  ['Full name', 'Email', 'Contact number', 'CONTACT METHOD', 'Event', 'Event Date',
   'CONSO DATE', 'Venue', 'Guests', 'PRESENTER', 'SALES NOTES', 'CLIENT NOTES',
   'TIMESTAMP', 'SOURCE', 'SUB-SOURCE'],
  ['Rosa Lim', 'rosa@example.com', '0917 999 0001', 'Viber please', 'Debut', '03/15/2027',
   '2026-01-04', 'Quezon City', '120', 'Mhay', 'Called twice, no answer',
   'Wants a garden setup', '2026-05-02', 'Website', 'Homepage Inquiry'],
  ['Ana Reyes', '', '0917 123 4567', 'Call', 'Corporate', '',
   '2026-01-05', 'Makati', '80', 'Vanessa', '', '', '2026-04-11', 'Website', 'Contact Us'],
  ['Ben Cruz', 'ben@example.com', '0918 999 0002', 'Text', 'Wedding', '06/06/2027',
   '', 'Tagaytay', '200', 'AJ', '', '', '2026-06-01', 'Exhibit', 'Bridal Fair 2026'],
  ['Cely Ong', 'cely@example.com', '0917 777 0003', 'Call', 'Kiddie Party', '03/04/2027',
   '', 'Pasig', '40', 'Pam', '', '', '2026-07-04', 'Website', 'Contact Us']
];
legacy.getRange(1, 1, legacyData.length, legacyData[0].length).setValues(legacyData);
tab('_Team').appendRow(['Iris', 'Iris', socials, '', 'yes', 0, '', '']);
api.resetCaches();

const dry = api.migrateExistingTab({ tabName: 'Iris', dryRun: true });
check('dry run reads every row', dry.migrated, 4);
check('dry run writes nothing', tab('Iris').getLastColumn(), 15);
check('dry run spots the cross-tab duplicate', dry.duplicatesFound, 1);
// The preview answers "where does my column end up", not "what does this
// header mean" — telling someone Guests maps to Guest Count leaves them
// hunting for a Guest Count column that will never appear.
check('preview: their venue column is kept',
  dry.mapping['Venue'], 'Venue / Location — stays in this column');
check('preview: their guest column is kept',
  dry.mapping['Guests'], 'Guest Count — stays in this column');
check('preview: their phone column is kept',
  dry.mapping['Contact number'], 'Phone — stays in this column');
check('preview: contact method goes to a new Message column',
  dry.mapping['CONTACT METHOD'], 'Message — new column');
check('preview shows conso date as ignored', dry.mapping['CONSO DATE'], '(ignored)');
check('preview reads their presenter column',
  dry.mapping['PRESENTER'], 'Presenter — stays in this column');

const migrated = api.migrateExistingTab({ tabName: 'Iris', subSource: 'Pre-automation' });
check('rows migrated', migrated.migrated, 4);
check('rows stayed in Iris', rows('Iris'), 4);
check('lead ids written', String(cellOf('Iris', 2, 'Lead ID')).slice(0, 3), 'LD-');
check('owner stamped from the tab', cellOf('Iris', 2, 'Assigned To'), 'Iris');
check('their phone is left exactly as typed', cellOf('Iris', 2, 'Phone'), '0917 999 0001');
check('their own column untouched', cellOf('Iris', 2, 'CONSO DATE'), '2026-01-04');
check('event type read from their Event column', cellOf('Iris', 2, 'Event Type'), 'Debut');
// 03/15/2027 can only be read one way, so it is normalised and the original
// kept alongside. 03/04/2027 on Cely's row cannot, so it is left untouched.
check('an unambiguous date is normalised', cellOf('Iris', 2, 'Event Date'), '2027-03-15');
check('the original is kept beside it', cellOf('Iris', 2, 'Event Date (Raw)'), '03/15/2027');
check('conso date did not become the event date',
  String(cellOf('Iris', 2, 'Event Date')).indexOf('2026-01'), -1);
check('an ambiguous date is left exactly as typed', cellOf('Iris', 5, 'Event Date'), '03/04/2027');
check('and is reported for a human to settle', migrated.ambiguousDates.length, 1);
check('the report names the row', migrated.ambiguousDates[0].row, 5);
check('the report names the person', migrated.ambiguousDates[0].name, 'Cely Ong');
check('the preview flags it too, before writing anything', dry.ambiguousDates.length, 1);
check('their venue column holds the venue', cellOf('Iris', 2, 'Venue'), 'Quezon City');
check('their guest column holds the count', cellOf('Iris', 2, 'Guests'), '120');
check('no duplicate venue column was added',
  tab('Iris').getRange(1, 1, 1, tab('Iris').getLastColumn()).getValues()[0]
    .indexOf('Venue / Location'), -1);
check('no duplicate guest column was added',
  tab('Iris').getRange(1, 1, 1, tab('Iris').getLastColumn()).getValues()[0]
    .indexOf('Guest Count'), -1);
check('timestamp used as received date',
  String(cellOf('Iris', 2, 'Received At')).slice(0, 10), '2026-05-02');
check('their own SOURCE wins over the dialog', cellOf('Iris', 2, 'Source'), 'Website');
check('their own SUB-SOURCE wins over the dialog',
  cellOf('Iris', 2, 'Sub-Source'), 'Homepage Inquiry');

const rosaNotes = String(cellOf('Iris', 2, 'Message'));
check('sales notes kept', /Sales Notes: Called twice, no answer/.test(rosaNotes), 'true');
check('client notes kept alongside them', /Client Notes: Wants a garden setup/.test(rosaNotes), 'true');
check('contact method landed in the notes', /Contact Method: Viber please/.test(rosaNotes), 'true');
check('presenter is a column, not a note', /Presenter:/.test(rosaNotes), 'false');
check('their existing presenter is kept as they had it',
  cellOf('Iris', 2, 'Presenter'), 'Mhay');
check('and the row below keeps its own', cellOf('Iris', 3, 'Presenter'), 'Vanessa');
check('labels are not shouted back at the rep', /SALES NOTES/.test(rosaNotes), 'false');
check('conso date is nowhere in the notes', /2026-01-04/.test(rosaNotes), 'false');

api.resetCaches();
const returning = post({ formName: 'Contact Us', name: 'Rosa Lim', email: 'rosa@example.com',
  'Type of Event': 'Debut' }, { source: 'website', form: 'Contact Us' });
check('a migrated lead now dedupes against new inquiries', returning.action, 'merged');
check('and stays in its own tab', returning.tab, 'Iris');
check('touch counted on the historical row', cellOf('Iris', 2, 'Touches'), 2);

api.resetCaches();
const second = api.migrateExistingTab({ tabName: 'Iris' });
check('re-running the migration is a no-op', second.migrated, 0);
check('already-migrated rows are recognised', second.alreadyDone, 4);

// A tab too big to finish inside Google's limit stops cleanly and resumes.
const big = book.insertSheet('Tonio');
const bigRows = [['Full name', 'Email', 'Contact number', 'Event']];
for (let i = 1; i <= 6; i++) {
  bigRows.push(['Big ' + i, 'big' + i + '@example.com', '0917 300 ' + (1000 + i), 'Wedding']);
}
big.getRange(1, 1, bigRows.length, 4).setValues(bigRows);
tab('_Team').appendRow(['Tonio', 'Tonio', 'Wedding', '', 'yes', 0, '', '']);
setSetting('Import Time Budget (seconds)', '0');
api.resetCaches();

const halted = api.migrateExistingTab({ tabName: 'Tonio' });
check('it stops rather than being killed', halted.stoppedEarly, 'true');
check('and says how many are left', halted.remaining, 6);
check('writing nothing it cannot finish', halted.migrated, 0);
check('so no row is left half-migrated', rows('Tonio'), 6);

setSetting('Import Time Budget (seconds)', '240');
api.resetCaches();
const resumed = api.migrateExistingTab({ tabName: 'Tonio' });
check('running it again finishes the job', resumed.migrated, 6);
check('and does not stop early this time', resumed.stoppedEarly, 'false');
check('every row now has a lead id',
  String(cellOf('Tonio', 7, 'Lead ID')).slice(0, 3), 'LD-');

realLog('\n--- a caller tab that uses its own column names ---');
silence(quiet);
// A tab that has been in use for years does not use our column names. Its
// columns still mean the same things, so they are used rather than duplicated.
const nina = book.insertSheet('Nina');
nina.getRange(1, 1, 1, 15).setValues([[
  'Full name', 'Email', 'Contact number', 'CONTACT METHOD', 'Event', 'Event Date',
  'CONSO DATE', 'Venue', 'Guests', 'PRESENTER', 'SALES NOTES', 'CLIENT NOTES',
  'TIMESTAMP', 'SOURCE', 'SUB-SOURCE']]);
tab('_Team').appendRow(['Nina', 'Nina', "Kid's Party", '', 'yes', 0, '', '']);
api.resetCaches();

// Naming the owner also proves a lead that arrives with one keeps it, rather
// than going into the rotation.
const ninaLead = post({ formName: 'Homepage Inquiry', name: 'Tess Ramos',
  email: 'tess@example.com', 'Contact Number': '0917 444 1111',
  'Type of Event': 'Kiddie Party', 'Number of Guests': '60',
  'Preferred Venue': 'Pasig', 'Assigned To': 'Nina',
  'Message': 'Asking for a quote' },
  { source: 'website', form: 'Homepage Inquiry' });
check('a lead naming its owner goes to them', ninaLead.tab, 'Nina');

const ninaHeaders = tab('Nina').getRange(1, 1, 1, tab('Nina').getLastColumn()).getValues()[0];
function hasColumn(name) {
  const squash = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return ninaHeaders.map(squash).indexOf(squash(name)) > -1;
}
check('no second phone column beside "Contact number"', hasColumn('Phone'), 'false');
check('no second event type column beside "Event"', hasColumn('Event Type'), 'false');
check('no second guest column beside "Guests"', hasColumn('Guest Count'), 'false');
check('no second venue column beside "Venue"', hasColumn('Venue / Location'), 'false');
check('no second timestamp column beside "TIMESTAMP"', hasColumn('Received At'), 'false');
check('columns it genuinely lacks are still added', hasColumn('Lead ID'), 'true');

check('their name column is filled', cellOf('Nina', 2, 'Full name'), 'Tess Ramos');
check('their phone column is filled as typed',
  cellOf('Nina', 2, 'Contact number'), '0917 444 1111');

// A guest phoning in from abroad keeps their own country's number, and is
// recognised as the same person whether or not they typed the +.
api.resetCaches();
const abroad = post({ formName: 'Homepage Inquiry', name: 'Grace Tan',
  email: 'grace@example.com', 'Contact Number': '+65 9123 4567',
  'Type of Event': 'Kiddie Party', 'Assigned To': 'Nina' },
  { source: 'website', form: 'Homepage Inquiry' });
check('an international number is stored as typed',
  cellOf('Nina', 3, 'Contact number'), '+65 9123 4567');
api.resetCaches();
const abroadAgain = post({ formName: 'Contact Us', name: 'Grace Tan',
  'Contact Number': '65 9123 4567' }, { source: 'website', form: 'Contact Us' });
check('the same number without the + is the same person', abroadAgain.action, 'merged');
check('and does not open a second row', abroadAgain.tab, 'Nina');
check('their event column is filled', cellOf('Nina', 2, 'Event'), "Kid's Party");
check('their guest column is filled', cellOf('Nina', 2, 'Guests'), '60');
check('their venue column is filled', cellOf('Nina', 2, 'Venue'), 'Pasig');
check('their source column is filled', cellOf('Nina', 2, 'SOURCE'), 'Website');
check('their sub-source column is filled', cellOf('Nina', 2, 'SUB-SOURCE'), 'Homepage Inquiry');
check('their presenter column is filled', cellOf('Nina', 2, 'PRESENTER'), 'AJ');
check('their timestamp column is filled',
  String(cellOf('Nina', 2, 'TIMESTAMP')).length > 0, 'true');
check('their notes columns are left alone', cellOf('Nina', 2, 'SALES NOTES'), '');
check('the message goes to its own column', cellOf('Nina', 2, 'Message'), 'Asking for a quote');

realLog('\n--- the digest: one email every ten new leads ---');
silence(quiet);
setSetting('Digest Every N Leads', '10');
setSetting('Digest Recipients', 'sales@example.com');
// Earlier sections already put leads in All Leads. On a fresh install the
// marker starts at the header and the first digest covers everything so far;
// here we start counting from now so the arithmetic is readable.
PropertiesService.getScriptProperties()
  .setProperty('DIGEST_MARK_ROW', String(tab('All Leads').getLastRow()));
api.resetCaches();

function digests() {
  return global.__mails.filter(m => /^\d+ new lead/.test(m.subject));
}
const digestsBefore = digests().length;

// Nine new leads should not send anything.
for (let i = 1; i <= 9; i++) {
  api.resetCaches();
  post({ formName: 'Homepage Inquiry', name: 'Digest ' + i, email: 'd' + i + '@example.com',
    'Contact Number': '0917 000 10' + (i < 10 ? '0' + i : i),
    'Type of Event': i % 3 === 0 ? 'Corporate seminar' : 'Church Wedding' },
    { source: 'website', form: 'Homepage Inquiry' });
}
check('nine new leads send no digest', digests().length, digestsBefore);

api.resetCaches();
post({ formName: 'Homepage Inquiry', name: 'Digest 10', email: 'd10@example.com',
  'Contact Number': '0917 000 1010', 'Type of Event': 'Debut' },
  { source: 'website', form: 'Homepage Inquiry' });
check('the tenth sends one', digests().length, digestsBefore + 1);

const sent = digests()[digests().length - 1];
check('it goes to the digest list', sent.to, 'sales@example.com');
check('the subject counts them', /^10 new leads/.test(sent.subject), 'true');
check('and breaks them down by event type', /Wedding/.test(sent.subject), 'true');
check('the body names a lead', /Digest 10/.test(sent.body), 'true');
check('and names who is calling them', /caller/.test(sent.body), 'true');
check('it links back to the sheet', /docs.google.com/.test(sent.body), 'true');

// A returning client is not a new lead, so the count does not move.
api.resetCaches();
const repeatLead = post({ formName: 'Contact Us', name: 'Digest 1', email: 'd1@example.com' },
  { source: 'website', form: 'Contact Us' });
check('a merge is not counted as a new lead', repeatLead.action, 'merged');
for (let i = 11; i <= 19; i++) {
  api.resetCaches();
  post({ formName: 'Homepage Inquiry', name: 'Digest ' + i, email: 'd' + i + '@example.com',
    'Contact Number': '0917 000 20' + i, 'Type of Event': 'Kiddie Party' },
    { source: 'website', form: 'Homepage Inquiry' });
}
check('nine more still send nothing', digests().length, digestsBefore + 1);
api.resetCaches();
post({ formName: 'Homepage Inquiry', name: 'Digest 20', email: 'd20@example.com',
  'Contact Number': '0917 000 2020', 'Type of Event': 'Kiddie Party' },
  { source: 'website', form: 'Homepage Inquiry' });
check('the twentieth sends the second digest', digests().length, digestsBefore + 2);
check('which covers only the leads since the first',
  /^10 new leads/.test(digests()[digests().length - 1].subject), 'true');

// A fair worksheet that crosses the threshold several times sends one email.
api.resetCaches();
const bulk = book.insertSheet('Bulk Fair');
const bulkRows = [['Name', 'Contact No.', 'Email Address']];
for (let i = 1; i <= 25; i++) {
  bulkRows.push(['Bulk ' + i, '0918 555 ' + (1000 + i), 'bulk' + i + '@example.com']);
}
bulk.getRange(1, 1, bulkRows.length, 3).setValues(bulkRows);
const digestsBeforeBulk = digests().length;
importFairWorksheet({ sheetName: 'Bulk Fair', fairName: 'Bulk Expo 2026' });
check('a 25-row import sends one email, not two', digests().length, digestsBeforeBulk + 1);
check('covering all 25', /^25 new leads/.test(digests()[digests().length - 1].subject), 'true');

setSetting('Digest Every N Leads', '0');
api.resetCaches();

realLog('\n--- starting from a blank spreadsheet ---');
silence(quiet);
// Nothing to detect, so the roster is typed by hand and setup turns it into
// tabs. An existing tab is never restyled.
tab('_Team').appendRow(['Dana', 'Dana', 'Wedding', '', 'yes', 0, '', '']);
tab('_Team').appendRow(['Resting Rey', 'Resting Rey', 'Wedding', '', 'no', 0, '', '']);
api.resetCaches();
check('the tab does not exist yet', !!tab('Dana'), 'false');
api.setupWorkbook();
check('setup creates a tab for an active salesperson', !!tab('Dana'), 'true');
check('with the lead columns ready', tab('Dana').getRange(1, 2).getValue(), 'Lead ID');
check('and none for someone not taking leads', !!tab('Resting Rey'), 'false');
api.resetCaches();

realLog('\n--- the digest does not try to summarise history ---');
{
  const many = [];
  for (let i = 0; i < 120; i++) {
    many.push({ name: 'Bulk ' + i, eventType: 'Wedding', source: 'Website',
      eventDate: '', caller: 'Bea', presenter: 'AJ', phone: '',
      email: 'bulk' + i + '@example.com', subSource: 'Fair', guestCount: '' });
  }
  const d = api.buildDigest_(many);
  check('the subject counts every lead', /^120 new leads/.test(d.subject), 'true');
  check('the roll call is capped', (d.text.match(/^Bulk /gm) || []).length, 50);
  check('and says how many it left out', /and 70 more/.test(d.text), 'true');
  const tbody = d.html.slice(d.html.indexOf('<tbody>'), d.html.indexOf('</tbody>'));
  check('the html table is capped too', (tbody.match(/<tr>/g) || []).length, 50);
  check('the body stays sendable', d.html.length < 100000, 'true');
}

realLog('\n--- the dashboard counts statuses where people edit them ---');
{
  const dash = tab('Dashboard');
  const formulaFor = label => {
    for (let r = 1; r <= dash.getLastRow(); r++) {
      if (String(dash.getRange(r, 1).getValue()) === label) {
        return String(dash.getRange(r, 2).getValue());
      }
    }
    return '(not found)';
  };
  const contacted = formulaFor('Valid');
  // Status is edited on a caller's own tab; the All Leads copy is only ever
  // updated by the automation, so counting it reports the day leads landed.
  check('status is not counted from All Leads', /All Leads/.test(contacted), 'false');
  check('status is counted from a caller tab', /COUNTIF\('Bea'!/.test(contacted), 'true');
  check('and from the shared event tabs', /COUNTIF\('Wedding'!/.test(contacted), 'true');
  check('every status row has a formula', formulaFor('Transferred').charAt(0), '=');
  // Set by the automation, never picked from the dropdown, still counted.
  check('leads with no contact details stay visible',
    formulaFor('Needs Contact Info').charAt(0), '=');
  check('a dropped status has no row', formulaFor('Booked'), '(not found)');
  // A caller writing NR by hand should land under No Response, not nowhere.
  const nr = formulaFor('No Response');
  check('NR is counted as No Response', /,"NR"\)/.test(nr), 'true');
  check('the full wording is counted too', /,"No Response"\)/.test(nr), 'true');
  check('both spellings on every tab',
    (nr.match(/COUNTIF\(/g) || []).length,
    (formulaFor('Valid').match(/COUNTIF\(/g) || []).length * 2);
  check('a status with no shorthand is unaffected',
    /"NR"/.test(formulaFor('Valid')), 'false');
  // The columns the automation owns still come from the master list.
  check('source still counted from All Leads', /All Leads/.test(formulaFor('Website')), 'true');
}

realLog('\n--- setup clears the Source colouring that was dropped ---');
{
  const sheet = tab('Bea');
  const col = api.fieldColumns_(sheet).byField['source'];
  const rule = (text, range, bg) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(text).setBackground(bg).setFontColor('#FFFFFF')
    .setRanges([range]).build();

  // Written when the tab was 200 rows tall; it has grown since, so the stored
  // range no longer matches what the Source column spans today.
  const asWritten = sheet.getRange(2, col, 199, 1);
  const today = sheet.getRange(2, col, sheet.getMaxRows() - 1, 1);
  check('the sheet has outgrown the old range',
    asWritten.getA1Notation() === today.getA1Notation(), 'false');

  const mineOnSource = rule('Booked', sheet.getRange(2, col, 40, 1), '#FFEB3B');
  const mineElsewhere = rule('MINE', sheet.getRange(2, 1, 40, 1), '#FFEB3B');
  sheet.setConditionalFormatRules([
    rule('Website', asWritten, '#1B5E20'),
    rule('Exhibit', asWritten, '#D6C7E8'),
    rule('Google Ads', asWritten, '#CFE0F3'),
    mineOnSource,
    mineElsewhere
  ]);

  api.resetCaches();
  api.setupWorkbook();

  const after = sheet.getConditionalFormatRules().map(r => r.__text);
  check('all three colour rules are cleared',
    ['Website', 'Exhibit', 'Google Ads'].some(t => after.indexOf(t) > -1), 'false');
  check('a rule on another column is kept', after.indexOf('MINE') > -1, 'true');
  check('a rule of yours on the Source column is kept', after.indexOf('Booked') > -1, 'true');
  check('running setup again is a no-op', (api.setupWorkbook(),
    sheet.getConditionalFormatRules().length), after.length);
}

realLog('\n--- the Leads menu is wired to real functions ---');
// A menu item names its handler as a string, so a missing or renamed function
// is invisible until someone clicks it and Apps Script says "Script function
// not found". Read the handlers straight out of the menu and check each one.
{
  // Read from the same text that was eval'd, so this works against the
  // bundle in dist/ as well as the individual files in src/.
  const menuSource = src;
  const handlers = [...menuSource.matchAll(/addItem\(\s*'[^']*'\s*,\s*'([^']+)'/g)]
    .map(m => m[1]);
  check('every menu item was found', handlers.length > 0, 'true');
  const missing = handlers.filter(name => typeof global[name] !== 'function' &&
    !new RegExp('function\\s+' + name + '\\s*\\(').test(src));
  check('every menu item has a function behind it', missing.join(', ') || 'none', 'none');
}

realLog('\n--- a fair too big for one run stops and carries on ---');
{
  silence(quiet);
  const big = book.insertSheet('Huge Organiser Export');
  const bigData = [['Name', 'Contact No.', 'Email Address', 'Wedding Date']];
  for (let i = 1; i <= 250; i++) {
    bigData.push(['Fair Guest ' + i, '', 'fairguest' + i + '@example.com', '']);
  }
  big.getRange(1, 1, bigData.length, 4).setValues(bigData);

  // Nothing may run for long here, so the budget is set to zero: every chunk
  // after the first finds the time already spent, which is the same decision
  // the importer makes on a real worksheet at four minutes.
  setSetting('Import Time Budget (seconds)', '0');
  api.resetCaches();

  const dupesBefore = rows('Duplicates');
  const first = api.importFairWorksheet({
    sheetName: 'Huge Organiser Export', fairName: 'Endless Expo 2026',
    fairDate: '2026-08-20', defaultEventType: 'Wedding'
  });
  check('it stops instead of being killed', first.stoppedEarly, 'true');
  check('one chunk got through', first.total, 100);
  check('and it says how many are left', first.remaining, 150);
  check('and which row to carry on from', first.nextRow, 101);
  check('the leads it did import are real', first.created, 100);

  const second = api.importFairWorksheet({
    sheetName: 'Huge Organiser Export', fairName: 'Endless Expo 2026',
    fairDate: '2026-08-20', defaultEventType: 'Wedding', startRow: first.nextRow
  });
  check('carrying on picks up where it stopped', second.startRow, 101);
  check('and takes the next chunk', second.total, 100);
  check('nothing is imported twice', second.merged, 0);
  check('so they are all new leads', second.created, 100);

  const third = api.importFairWorksheet({
    sheetName: 'Huge Organiser Export', fairName: 'Endless Expo 2026',
    fairDate: '2026-08-20', defaultEventType: 'Wedding', startRow: second.nextRow
  });
  check('the last stretch finishes', third.stoppedEarly, 'false');
  check('and it is the remainder', third.total, 50);
  check('every row landed exactly once', first.created + second.created + third.created, 250);
  check('none of it was filed as a duplicate', rows('Duplicates'), dupesBefore);

  setSetting('Import Time Budget (seconds)', '240');
  api.resetCaches();

  // The safety net: the index reached the sheet chunk by chunk, so someone who
  // loses track and starts the whole worksheet over merges into what is already
  // there instead of doubling it.
  const again = api.importFairWorksheet({
    sheetName: 'Huge Organiser Export', fairName: 'Endless Expo 2026',
    fairDate: '2026-08-20', defaultEventType: 'Wedding'
  });
  check('starting the whole thing over runs to the end', again.stoppedEarly, 'false');
  check('and reads every row again', again.total, 250);
  check('creating nothing new', again.created, 0);
  check('because all 250 are recognised', again.merged, 250);

  const budgeted = api.importFairWorksheet({
    sheetName: 'Organiser Export', fairName: 'Wedding Expo Manila 2026',
    fairDate: '2026-08-15', defaultEventType: 'Wedding'
  });
  check('a worksheet inside the budget runs straight through',
    budgeted.stoppedEarly, 'false');
  check('and reports no resume point', budgeted.nextRow, 0);
}

realLog('\n--- the same client, on forms that ask for different things ---');
{
  silence(quiet);
  // The gap this closes: one form asks only for an email, another only for a
  // phone. The two submissions then share no key at all, so the same client is
  // created twice and dealt to two different callers.
  const twice = function (a, b) {
    api.resetCaches();
    post(a, { source: 'website' });
    api.resetCaches();
    return post(b, { source: 'website' });
  };

  setSetting('Dedupe On', 'email,phone');
  const split = twice(
    { formName: 'Email Only Form', name: 'Split Person', email: 'split@example.com',
      'Type of Event': 'Wedding' },
    { formName: 'Phone Only Form', name: 'Split Person', 'Contact Number': '0917 321 7654',
      'Type of Event': 'Wedding' });
  check('on email,phone the same client arrives twice', split.action, 'created');

  setSetting('Dedupe On', 'email,phone,name');
  api.resetCaches();
  const joined = twice(
    { formName: 'Email Only Form', name: 'Joined Person', email: 'joined@example.com',
      'Type of Event': 'Wedding' },
    { formName: 'Phone Only Form', name: 'Joined Person', 'Contact Number': '0917 456 6543',
      'Type of Event': 'Wedding' });
  check('adding name catches it', /^merged/.test(joined.action), 'true');

  // Weakest signal, so it must never beat a real contact match.
  api.resetCaches();
  post({ formName: 'F', name: 'Name Order', email: 'nameorder@example.com',
    'Contact Number': '0917 010 1010', 'Type of Event': 'Wedding' }, { source: 'website' });
  api.resetCaches();
  post({ formName: 'F', name: 'Someone Else Entirely',
    email: 'nameorder@example.com', 'Type of Event': 'Wedding' }, { source: 'website' });
  // What the sheet records is what matters: the Duplicates row says which
  // signal caught it, and a real contact match must never be reported as Name.
  const dupes = tab('Duplicates');
  check('email still wins over name',
    cellOf('Duplicates', dupes.getLastRow(), 'Matched On'), 'Email');

  // Squashed, so how it was typed does not matter.
  api.resetCaches();
  post({ formName: 'F', name: 'MARIA  CLARA', email: 'mc1@example.com',
    'Type of Event': 'Wedding' }, { source: 'website' });
  api.resetCaches();
  const cased = post({ formName: 'F', name: 'Maria Clara', 'Contact Number': '0917 020 2020',
    'Type of Event': 'Wedding' }, { source: 'website' });
  check('caps and spacing do not hide a name match', /^merged/.test(cased.action), 'true');
  check('and it is recorded as a name match',
    cellOf('Duplicates', tab('Duplicates').getLastRow(), 'Matched On'), 'Name');

  // Turning the setting on is worthless if a rebuild does not write name keys.
  api.resetCaches();
  api.rebuildIndex();
  const keys = tab('_Index').getRange(2, 1, tab('_Index').getLastRow() - 1, 1).getValues()
    .map(r => String(r[0]));
  check('a rebuild writes name keys too',
    keys.some(k => k.indexOf('name:') === 0), 'true');

  setSetting('Dedupe On', 'email,phone');
  api.resetCaches();
  const rebuilt = api.rebuildIndex();
  const after = tab('_Index').getRange(2, 1, tab('_Index').getLastRow() - 1, 1).getValues()
    .map(r => String(r[0]));
  check('and stops writing them when the setting is taken back out',
    after.some(k => k.indexOf('name:') === 0), 'false');
  check('the rebuild still indexed every lead', rebuilt > 0, 'true');
}

realLog('\n--- a worked lead colours its own row ---');
{
  silence(quiet);
  api.setupWorkbook();
  const rulesOn = name => tab(name).getConditionalFormatRules();
  const ruleFor = (name, status) => rulesOn(name).filter(r =>
    String(r.__formula || '').indexOf('="' + status + '"') !== -1)[0];

  check('a caller tab is coloured by status', !!ruleFor('Bea', 'Valid'), 'true');
  check('and so is a shared event tab', !!ruleFor('Wedding', 'Lost'), 'true');
  check('the Duplicates tab too', !!ruleFor('Duplicates', 'Duplicate'), 'true');
  // All Leads only ever carries the automation's copy of a status, so
  // colouring it would present a stale value as a current one.
  check('All Leads is left alone', !!ruleFor('All Leads', 'Valid'), 'false');

  check('valid is green', ruleFor('Bea', 'Valid').__background, '#D9EAD3');
  check('lost is red', ruleFor('Bea', 'Lost').__background, '#F4CCCC');
  check('transferred is purple', ruleFor('Bea', 'Transferred').__background, '#D9D2E9');
  check('no response is blue', ruleFor('Bea', 'No Response').__background, '#CFE2F3');
  check('duplicate is orange', ruleFor('Duplicates', 'Duplicate').__background, '#FCE5CD');
  check('new is plain white', ruleFor('Bea', 'New').__background, '#FFFFFF');

  // The rule has to read the tab's own Status column, wherever it sits, and
  // hold that column steady while the row moves down the sheet.
  const bea = tab('Bea');
  const statusCol = api.fieldColumns_(bea).byField.status;
  const letter = String.fromCharCode(64 + statusCol);
  check('it reads that tab\'s own Status column',
    ruleFor('Bea', 'Valid').__formula, '=OR($' + letter + '2="Valid")');
  check('NR is coloured as No Response',
    /\$[A-Z]+2="NR"/.test(ruleFor('Bea', 'No Response').__formula), 'true');

  const painted = ruleFor('Bea', 'Valid').getRanges()[0];
  check('the whole row is painted, not just the cell',
    painted.getNumColumns() >= 20, 'true');
  check('starting below the header', painted.getRow(), 2);

  // Running setup again must replace the set, not stack another behind it.
  const before = rulesOn('Bea').length;
  api.setupWorkbook();
  check('running setup again does not stack rules', rulesOn('Bea').length, before);

  // A rule somebody set up for themselves is not ours to remove.
  const mine = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('URGENT').setBackground('#FFFF00')
    .setRanges([bea.getRange(2, 1, 10, 1)]).build();
  bea.setConditionalFormatRules([mine].concat(rulesOn('Bea')));
  api.setupWorkbook();
  check('a rule of their own survives',
    rulesOn('Bea').filter(r => r.__text === 'URGENT').length, 1);
  check('and still wins, because ours go last',
    rulesOn('Bea')[0].__text, 'URGENT');
}

realLog('\n--- the dashboard counts a month by week, split by source ---');
{
  silence(quiet);
  api.setupWorkbook();
  const dash = tab('Dashboard');
  const rowOf = label => {
    for (let r = 1; r <= dash.getLastRow(); r++) {
      if (String(dash.getRange(r, 1).getValue()) === label) return r;
    }
    return 0;
  };
  const cellAt = (label, col) => {
    const r = rowOf(label);
    return r ? String(dash.getRange(r, col).getValue()) : '(not found)';
  };

  // Column 1 is the label, then one per source in SOURCES order, then the total.
  const headerRow = rowOf('Leads by week');
  const headings = [];
  for (let c = 2; c <= 6; c++) headings.push(String(dash.getRange(headerRow, c).getValue()));
  check('a column per source, then the total',
    headings.slice(0, 4).join(' | '), 'Website | Google Ads | Exhibit | All sources');
  check('and the month names itself',
    /^=TEXT\(TODAY\(\),"mmmm yyyy"\)$/.test(headings[4]), 'true');

  // The buckets are a tuning knob, so guard the invariant rather than the
  // numbers: every day of a long month lands in exactly one week.
  const covered = {};
  api.WEEK_BUCKETS.forEach(b => {
    for (let d = b.from; d <= b.to; d++) covered[d] = (covered[d] || 0) + 1;
  });
  const days = Object.keys(covered).map(Number).sort((a, b) => a - b);
  check('the weeks start at day 1', days[0], 1);
  check('and run to day 31', days[days.length - 1], 31);
  check('with no day left out', days.length, 31);
  check('and no day counted twice',
    days.filter(d => covered[d] !== 1).join(',') || 'none', 'none');

  check('every week the team named has a row',
    api.WEEK_BUCKETS.filter(b => rowOf(b.label) === 0).length, 0);
  check('and a running month total', cellAt('This month', 5).charAt(0), '=');

  const w1website = cellAt('Week 1 (1-7)', 2);
  const w1total = cellAt('Week 1 (1-7)', 5);
  check('the website column filters on Website',
    /\*\(src="Website"\)/.test(w1website), 'true');
  check('the google ads column filters on Google Ads',
    /\*\(src="Google Ads"\)/.test(cellAt('Week 1 (1-7)', 3)), 'true');
  check('the exhibit column filters on Exhibit',
    /\*\(src="Exhibit"\)/.test(cellAt('Week 1 (1-7)', 4)), 'true');
  // Counted, not summed, so a lead carrying a source outside the list still
  // reaches the total and the row visibly stops adding up.
  check('the total filters on no source at all', /src=/.test(w1total), 'false');

  // Counted on when the lead arrived, from the one tab that holds every lead
  // exactly once - repeat inquiries are filed in Duplicates, not counted again.
  const allLeads = tab('All Leads');
  const headers = allLeads.getRange(1, 1, 1, allLeads.getLastColumn()).getValues()[0];
  const dateLetter = String.fromCharCode(65 + headers.indexOf('Received At'));
  const srcLetter = String.fromCharCode(65 + headers.indexOf('Source'));
  const subSourceLetter = String.fromCharCode(65 + headers.indexOf('Sub-Source'));
  check('the week count reads Received At',
    w1total.indexOf("'All Leads'!" + dateLetter + '2:' + dateLetter) !== -1, 'true');
  check('and a source column reads Source',
    w1website.indexOf("'All Leads'!" + srcLetter + '2:' + srcLetter) !== -1, 'true');

  check('week 1 asks for days 1 to 7', /\(dnum>=1\)\*\(dnum<=7\)/.test(w1total), 'true');
  check('week 4 asks for days 22 to 31',
    /\(dnum>=22\)\*\(dnum<=31\)/.test(cellAt('Week 4 (22-31)', 5)), 'true');
  check('it is scoped to the current month',
    /LEFT\(d,7\)=TEXT\(TODAY\(\),"yyyy-mm"\)/.test(w1total), 'true');
  // A real date value and the text the automation writes have to count alike.
  check('both stored date shapes are read', /TEXT\(r,"yyyy-mm-dd"\)/.test(w1total), 'true');
  check('DAY is not used as a LET name', /,day,/.test(w1website), 'false');
  // TEXT, LEFT, MID and VALUE do not map over a range on their own, and they
  // are bound outside the SUMPRODUCT that would otherwise force it. Left to
  // implicit propagation the binding can collapse to the first cell and every
  // week reads zero, which looks like a quiet month rather than a broken sum.
  check('the date is mapped over the range, not assumed',
    /d,ARRAYFORMULA\(LEFT\(TEXT\(r,/.test(w1total), 'true');
  check('and so is the day number',
    /dnum,ARRAYFORMULA\(IFERROR\(VALUE\(/.test(w1total), 'true');
  check('and the product it is all multiplied into',
    /SUMPRODUCT\(ARRAYFORMULA\(/.test(w1total), 'true');

  // Every other block is narrower than the grid; a ragged array would not write.
  check('the narrow blocks are padded out', cellAt('Duplicates caught', 5), '');
  check('and still hold their own count', cellAt('Duplicates caught', 2).charAt(0), '=');

  // The sub-source roll-up is a QUERY, and a malformed one fails into the
  // IFERROR rather than showing an error -- it reads "No leads yet" for ever
  // while leads pile up. A doubled quote in a label did exactly that.
  const subRow = rowOf('Leads by sub-source') + 1;
  const query = String(dash.getRange(subRow, 1).getValue());
  check('the sub-source roll-up is a query', /^=IFERROR\(QUERY\(/.test(query), 'true');
  check('no doubled quote in its labels', /''/.test(query), 'false');
  check('the count is labelled once', /count\([A-Z]+\) 'Leads'/.test(query), 'true');
  check('and so is the group', /label [A-Z]+ 'Sub-Source'/.test(query), 'true');
  check('it reads the Sub-Source column',
    query.indexOf("'All Leads'!" + subSourceLetter + '2:' + subSourceLetter) !== -1, 'true');
}

realLog('\n--- moving a lead hands over everything, not just the row ---');
{
  silence(quiet);
  // Quin covers one event type only, which is what lets a move settle what an
  // Unassigned lead is. Pia covers Corporate so a Wedding lead cannot be
  // routed to her by rotation — the only way onto her tab is the move itself.
  tab('_Team').appendRow(['Pia', 'Pia', 'Corporate', '', 'yes', 0, '', '']);
  tab('_Team').appendRow(['Quin', 'Quin', "Kid's Party", '', 'yes', 0, '', '']);
  api.resetCaches();

  const landed = post({ formName: 'Homepage Inquiry', name: 'Move Me',
    email: 'moveme@example.com', 'Contact Number': '09171239876',
    'Type of Event': 'Wedding', 'Assigned To': 'Bea' }, { source: 'website' });
  check('the lead starts on the named owner', landed.tab, 'Bea');
  const fromRow = tab('Bea').getLastRow();
  const allRow = tab('All Leads').getLastRow();
  const before = rows('Bea');

  const counts = function () {
    api.resetCaches();
    const out = {};
    api.loadTeam_().forEach(function (m) { out[m.name] = m.count; });
    return out;
  };
  const was = counts();

  const moved = api.moveLead('Bea', fromRow, 'Pia');
  check('the move says where it went', moved.ok + ' ' + moved.to, 'true Pia');
  check('the row leaves the old tab', rows('Bea'), before - 1);
  const piaRow = tab('Pia').getLastRow();
  check('and lands on the new one', cellOf('Pia', piaRow, 'Full Name'), 'Move Me');
  check('the new owner is named on it', cellOf('Pia', piaRow, 'Assigned To'), 'Pia');
  check('the hand-off is written into the message',
    /moved from Bea to Pia/.test(cellOf('Pia', piaRow, 'Message')), 'true');
  check('All Leads follows the lead', cellOf('All Leads', allRow, 'Assigned To'), 'Pia');
  check('the lead keeps its own history', cellOf('Pia', piaRow, 'Touches'), 1);

  const now = counts();
  check("the receiver's tally goes up", now['Pia'] - was['Pia'], 1);
  check("the sender's is credited back", now['Bea'] - was['Bea'], -1);

  // The point of the whole exercise: the next submission from this client has
  // to find the row on the tab it actually lives on now.
  api.resetCaches();
  post({ formName: 'Homepage Inquiry', name: 'Move Me', email: 'moveme@example.com',
    'Type of Event': 'Wedding', message: 'following up' }, { source: 'website' });
  check('a repeat merges onto the moved row', cellOf('Pia', piaRow, 'Touches'), 2);
  check('and nothing new was created on the old tab', rows('Bea'), before - 1);
}

realLog('\n--- what a move settles, and what it refuses ---');
{
  silence(quiet);
  api.resetCaches();
  const stray = post({ formName: 'Homepage Inquiry', name: 'No Type Given',
    email: 'notype-move@example.com' }, { source: 'website' });
  check('a lead with no event type waits in Unassigned', stray.tab, 'Unassigned');
  const strayRow = tab('Unassigned').getLastRow();

  const settled = api.moveLead('Unassigned', strayRow, 'Quin');
  check('a receiver who covers one type settles what it is',
    settled.eventType, "Kid's Party");
  check('and the event type is on the row',
    cellOf('Quin', tab('Quin').getLastRow(), 'Event Type'), "Kid's Party");

  const quinRow = tab('Quin').getLastRow();
  setCellOf('Quin', quinRow, 'Status', 'Transferred');
  const onward = api.moveLead('Quin', quinRow, 'Pia');
  check('a lead marked Transferred arrives as unworked work',
    cellOf('Pia', tab('Pia').getLastRow(), 'Status'), 'New');
  check('the onward move is reported too', onward.to, 'Pia');

  const piaLast = tab('Pia').getLastRow();
  check('the header row is not a lead', api.moveLead('Pia', 1, 'Quin').ok, 'false');
  check('nor is a row past the end',
    api.moveLead('Pia', piaLast + 5, 'Quin').ok, 'false');
  check('a tab that holds no leads is refused',
    api.moveLead('_Settings', 2, 'Quin').ok, 'false');
  check('an unknown destination is refused',
    api.moveLead('Pia', piaLast, 'Somebody Else').ok, 'false');
  check('and so is moving a lead to where it already is',
    api.moveLead('Pia', piaLast, 'Pia').ok, 'false');
  check('a refusal moves nothing', cellOf('Pia', piaLast, 'Full Name'), 'No Type Given');
}

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

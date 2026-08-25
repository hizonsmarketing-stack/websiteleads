/**
 * Website Leads Automation — bundled build.
 *
 * GENERATED FILE. Do not edit here: change the matching file under src/ and
 * run `npm run bundle`. Built from:
 *   src/00_Config.gs
 *   src/01_Util.gs
 *   src/02_Sheets.gs
 *   src/03_Normalize.gs
 *   src/04_Mapping.gs
 *   src/05_Dedupe.gs
 *   src/06_Router.gs
 *   src/07_Intake.gs
 *   src/08_WebApp.gs
 *   src/09_FairImport.gs
 *   src/10_Setup.gs
 *   src/11_Menu.gs
 *   src/12_Tests.gs
 *   src/13_Migrate.gs
 */

// ==========================================================================
// src/00_Config.gs
// ==========================================================================

/**
 * Website Leads Automation — central configuration.
 *
 * Everything a non-developer needs to change day to day lives in the
 * _Settings and _Sources tabs of the spreadsheet, not in here. This file holds
 * the structural defaults: the column schema, the event-type routing table and
 * the field-alias dictionary used to read unfamiliar forms and fair worksheets.
 */

/** Spreadsheet tabs the automation owns. */
const SHEETS = {
  allLeads: 'All Leads',
  duplicates: 'Duplicates',
  unassigned: 'Unassigned',
  settings: '_Settings',
  team: '_Team',
  sources: '_Sources',
  index: '_Index',
  log: '_Log',
  raw: '_Raw'
};

/**
 * Canonical lead record, in column order. Team tabs and All Leads share it.
 *
 * Presenter leads the row deliberately: a tab belongs to one caller, and the
 * first thing they need to see on a lead is which presenter it goes to.
 */
const LEAD_COLUMNS = [
  'Presenter',
  'Lead ID',
  'Received At',
  'Source',
  'Sub-Source',
  'Event Type',
  'Event Type (Raw)',
  'Full Name',
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Phone (Raw)',
  'Company',
  'Event Date',
  'Event Date (Raw)',
  'Guest Count',
  'Venue / Location',
  'Budget',
  'Message',
  'Campaign',
  'Assigned To',
  'Status',
  'Touches',
  'First Seen At',
  'Last Touch At',
  'All Sub-Sources',
  'Raw Ref'
];

/**
 * The salesperson roster. Leads are routed to a person's own tab, chosen by
 * round robin among whoever covers that event type.
 */
const TEAM_COLUMNS = [
  'Salesperson',
  'Tab Name',
  'Event Types',
  'Email',
  'Active',
  'Assigned Count',
  'Last Assigned At',
  'Notes'
];

/** Extra columns only the Duplicates tab carries, appended after LEAD_COLUMNS. */
const DUPLICATE_EXTRA_COLUMNS = ['Matched On', 'Original Lead ID', 'Original Tab'];

/**
 * Event types, and the shared tab each one falls back to when nobody on the
 * _Team roster covers it.
 *
 * `keywords` are matched against whatever the form or worksheet supplied. The
 * longest matching keyword wins, so the most specific reading is used: "18th
 * birthday" is a Debut rather than a generic birthday, "kiddie party" is a
 * Kid's Party, "corporate anniversary" is Corporate rather than an anniversary.
 *
 * A plain "birthday" with nothing else to go on is treated as a Private Event —
 * an adult's birthday party. Move the word to another type's list if that is
 * the wrong default for your enquiries.
 *
 * Add a type by adding an entry here, then run Leads > Setup / repair tabs.
 */
const EVENT_TYPES = [
  {
    key: 'wedding',
    label: 'Wedding',
    tab: 'Wedding',
    keywords: [
      'wedding', 'bridal', 'bride', 'groom', 'engagement', 'nuptial',
      'church wedding', 'civil wedding', 'garden wedding', 'destination wedding',
      'prenup', 'pre-nup', 'wedding reception', 'kasal', 'renewal of vows',
      'wedding anniversary party'
    ]
  },
  {
    key: 'debut',
    label: 'Debut',
    tab: 'Debut',
    keywords: [
      'debut', 'debutante', 'cotillion', '18th birthday', '18th bday',
      '18th bday party', 'eighteenth birthday', '18 birthday', 'sweet 16',
      '16th birthday'
    ]
  },
  {
    key: 'kids',
    label: "Kid's Party",
    tab: "Kid's Party",
    keywords: [
      'kiddie party', 'kids party', "kid's party", 'kids birthday',
      "children's party", 'childrens party', 'children party', 'kiddie',
      '1st birthday', 'first birthday', '7th birthday', 'christening',
      'baptism', 'binyag', 'baby shower', 'gender reveal', 'kids event'
    ]
  },
  {
    key: 'private',
    label: 'Private Event',
    tab: 'Private Event',
    keywords: [
      'private', 'private event', 'intimate', 'intimate gathering',
      'family gathering', 'dinner party', 'house party', 'get together',
      'get-together', 'small gathering', 'birthday', 'bday', 'anniversary',
      'reunion', 'graduation', 'despedida', 'homecoming', 'retirement',
      'thanksgiving', 'funeral', 'memorial', 'wake'
    ]
  },
  {
    key: 'corporate',
    label: 'Corporate',
    tab: 'Corporate',
    keywords: [
      'corporate', 'company', 'business', 'conference', 'seminar', 'convention',
      'meeting', 'team building', 'teambuilding', 'product launch', 'launch',
      'gala', 'awards night', 'awarding', 'christmas party', 'year end party',
      'general assembly', 'training', 'workshop', 'summit', 'expo',
      'grand opening', 'ribbon cutting', 'groundbreaking', 'inauguration',
      'corporate anniversary', 'company anniversary', 'annual meeting',
      'stockholders meeting', 'client appreciation'
    ]
  }
];

/** Where leads land when the event type is missing or unrecognised. */
const FALLBACK_EVENT_TYPE = {
  key: 'unassigned',
  label: 'Unassigned',
  tab: SHEETS.unassigned,
  keywords: []
};

/** The three lead sources, tagged on every row. */
const SOURCES = {
  website: 'Website',
  googleAds: 'Google Ads',
  exhibit: 'Exhibit'
};

/** Defaults, overridable per-key from the _Settings tab. */
const DEFAULT_SETTINGS = {
  'Time Zone': 'Asia/Manila',
  'Default Country Code': '63',
  'Dedupe On': 'email,phone',
  'Dedupe Ignore Plus Tags': 'yes',
  'Promote Unassigned Leads': 'yes',
  'Append Duplicate Notes': 'yes',
  'Accept Test Leads': 'no',
  'Round Robin Assignment': 'yes',
  'Presenters': 'AJ, Pam, Mhay, Vanessa',
  'Notify On New Lead': 'no',
  'Raw Payload Retention (rows)': '2000',
  'Log Retention (rows)': '5000'
};

/**
 * Canonical field <- possible header / key names.
 *
 * Comparison is done on a squashed key (lowercase, letters and digits only),
 * so "Contact No.", "contact_no" and "CONTACT NO" all collapse to "contactno".
 * Google Ads column ids (FULL_NAME, PHONE_NUMBER, ...) collapse the same way.
 */
const FIELD_ALIASES = {
  fullName: [
    'name', 'full name', 'fullname', 'complete name', 'client name',
    'contact person', 'contact name', 'lead name', 'guest name', 'your name',
    'customer name', 'pangalan'
  ],
  firstName: ['first name', 'firstname', 'fname', 'given name', 'first'],
  lastName: ['last name', 'lastname', 'lname', 'surname', 'family name', 'last'],
  email: [
    'email', 'e mail', 'email address', 'emailaddress', 'e mail address',
    'work email', 'business email', 'contact email'
  ],
  phone: [
    'phone', 'phone number', 'mobile', 'mobile number', 'mobile no',
    'contact number', 'contact no', 'contact', 'cell', 'cellphone',
    'cell number', 'telephone', 'tel', 'tel no', 'work phone', 'viber',
    'viber number', 'whatsapp', 'number'
  ],
  company: [
    'company', 'company name', 'organization', 'organisation',
    'organization name', 'business name', 'employer', 'job title'
  ],
  eventType: [
    'event type', 'type of event', 'event', 'occasion', 'celebration',
    'inquiry type', 'type of inquiry', 'event category', 'category',
    'package type', 'service', 'service needed', 'interested in',
    'what is the occasion', 'nature of event'
  ],
  eventDate: [
    'event date', 'date of event', 'preferred date', 'target date',
    'wedding date', 'date of wedding', 'affair date', 'date of affair',
    'celebration date', 'party date', 'debut date', 'reception date',
    'tentative date', 'date', 'schedule', 'when is your event',
    'when', 'proposed date', 'function date'
  ],
  guestCount: [
    'guest count', 'guests', 'number of guests', 'no of guests', 'pax',
    'headcount', 'head count', 'estimated guests', 'estimated pax',
    'expected guests', 'how many guests', 'number of pax'
  ],
  venue: [
    'venue', 'location', 'preferred venue', 'preferred location', 'place',
    'area', 'city', 'address', 'event location', 'event venue', 'branch'
  ],
  budget: [
    'budget', 'budget range', 'estimated budget', 'price range',
    'budget per head', 'budget per pax', 'target budget'
  ],
  presenter: [
    'presenter', 'presentor', 'presented by', 'assigned presenter',
    'presenter assigned', 'endorsed to'
  ],
  message: [
    'message', 'notes', 'note', 'remarks', 'comments', 'comment', 'inquiry',
    'sales notes', 'client notes', 'internal notes', 'contact method',
    'preferred contact method', 'preferred contact', 'contact preference',
    'mode of contact', 'how to contact', 'best time to call',
    'inquiry details', 'details', 'additional info', 'additional information',
    'question', 'questions', 'how can we help', 'tell us more', 'other details',
    'requirements', 'special requests'
  ],
  campaign: [
    'campaign', 'campaign id', 'campaign name', 'utm campaign', 'ad group',
    'adgroup id', 'creative id', 'source campaign', 'ad'
  ],
  subSource: [
    'sub source', 'subsource', 'form', 'form name', 'formname', 'form id',
    'form title', 'source form', 'fair', 'fair name', 'event name', 'exhibit'
  ],
  source: ['source', 'lead source', 'channel'],
  receivedAt: [
    'received at', 'timestamp', 'date submitted', 'submitted at', 'submission date',
    'date received', 'created at', 'date and time'
  ],
  assignedTo: ['assigned to', 'owner', 'sales rep', 'account executive', 'ae', 'handler'],
  status: ['status', 'lead status', 'stage']
};

/**
 * Last-resort matching for headers no alias covers. Applied only when nothing
 * else matched, so "Wedding Date" and "Anniversary Date" find the event date
 * column while "Date Received" still matches its own alias first.
 */
const FIELD_SUFFIX_RULES = [
  { suffix: 'date', field: 'eventDate' },
  { suffix: 'email', field: 'email' },
  { suffix: 'emailaddress', field: 'email' }
];

/** Keys carried by a Google Ads lead-form webhook payload. */
const GOOGLE_ADS_MARKERS = ['user_column_data', 'google_key', 'lead_id'];

/**
 * Keys dropped entirely: webhook plumbing, and internal columns the sales team
 * has asked not to carry over. Everything else that matches no field is kept
 * in the Message column rather than discarded.
 */
const NOISE_KEYS = [
  'conso date',
  'google key', 'api version', 'is test', 'gcl id', 'lead id', 'form id',
  'submission id', 'recaptcha', 'captcha', 'token', 'ip address', 'user agent',
  'consent', 'terms', 'privacy policy', 'submit', 'g recaptcha response'
];

// ==========================================================================
// src/01_Util.gs
// ==========================================================================

/**
 * Small shared helpers: settings access, spreadsheet lookups, logging.
 */

/** @return {GoogleAppsScript.Spreadsheet.Spreadsheet} The spreadsheet this script drives. */
function getSpreadsheet_() {
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  if (bound) return bound;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error(
      'No spreadsheet available. Bind this script to the sales worksheet, or set ' +
      'the SPREADSHEET_ID script property.'
    );
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Reads the _Settings tab into a plain object, falling back to DEFAULT_SETTINGS.
 * Cached for the life of the execution so a batch import reads it once.
 * @return {!Object<string,string>}
 */
let SETTINGS_CACHE_ = null;
function getSettings_() {
  if (SETTINGS_CACHE_) return SETTINGS_CACHE_;
  const settings = Object.assign({}, DEFAULT_SETTINGS);
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.settings);
  if (sheet && sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    rows.forEach(function (row) {
      const key = String(row[0] || '').trim();
      if (key) settings[key] = String(row[1] === null ? '' : row[1]).trim();
    });
  }
  SETTINGS_CACHE_ = settings;
  return settings;
}

/** @return {string} A setting value, or the supplied fallback when blank. */
function setting_(key, fallback) {
  const value = getSettings_()[key];
  return (value === undefined || value === '') ? fallback : value;
}

/** @return {boolean} True for yes / true / 1 / on. */
function settingIsOn_(key) {
  return /^(yes|y|true|1|on)$/i.test(String(setting_(key, 'no')));
}

/** @return {string} The spreadsheet time zone, preferring the _Settings value. */
function timeZone_() {
  return setting_('Time Zone', Session.getScriptTimeZone() || 'Asia/Manila');
}

/** @return {string} Now, formatted for a sheet cell. */
function nowStamp_() {
  return Utilities.formatDate(new Date(), timeZone_(), 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Squashes a header or key to a comparable token: lowercase, letters and
 * digits only. "Contact No." and "CONTACT_NO" both become "contactno".
 * @param {*} value
 * @return {string}
 */
function squashKey_(value) {
  return String(value === null || value === undefined ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** @return {string} Trimmed, collapsed-whitespace string form of any value. */
function cleanText_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate_(value);
  return String(value).replace(/\s+/g, ' ').trim();
}

/** @return {string} yyyy-MM-dd for a Date. */
function formatDate_(date) {
  return Utilities.formatDate(date, timeZone_(), 'yyyy-MM-dd');
}

/** @return {string} A stable, readable lead id: LD-20260823-a1b2c3d4 */
function makeLeadId_() {
  const stamp = Utilities.formatDate(new Date(), timeZone_(), 'yyyyMMdd');
  const rand = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  return 'LD-' + stamp + '-' + rand;
}

/**
 * Appends a line to the _Log tab and to Stackdriver. Never throws — logging
 * must not be able to take the intake pipeline down.
 * @param {string} level INFO | WARN | ERROR
 * @param {string} context Where it happened, e.g. "webhook" or "fair-import".
 * @param {string} message
 * @param {*=} details Optional object, serialised to JSON.
 */
function log_(level, context, message, details) {
  const line = '[' + level + '] ' + context + ': ' + message;
  console.log(line, details === undefined ? '' : details);
  try {
    const sheet = getOrCreateSheet_(SHEETS.log, ['Timestamp', 'Level', 'Context', 'Message', 'Details']);
    sheet.appendRow([
      nowStamp_(),
      level,
      context,
      message,
      details === undefined ? '' : JSON.stringify(details).slice(0, 4000)
    ]);
  } catch (err) {
    console.error('Could not write to ' + SHEETS.log + ': ' + err);
  }
}

/**
 * Trims a sheet down to its most recent `keep` data rows, oldest first out.
 * Used to stop _Log and _Raw growing without bound.
 * @param {string} sheetName
 * @param {number} keep
 */
function trimSheet_(sheetName, keep) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return;
  const dataRows = sheet.getLastRow() - 1;
  if (dataRows <= keep) return;
  sheet.deleteRows(2, dataRows - keep);
}

/**
 * Runs `fn` while holding the document lock, so two webhook calls can never
 * interleave their reads and writes of the dedupe index.
 * @param {function():T} fn
 * @param {number=} timeoutMs
 * @return {T}
 * @template T
 */
function withLock_(fn, timeoutMs) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(timeoutMs || 30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Walks an arbitrarily nested object/array and returns a flat map of
 * leaf path -> value. Wix and other form tools nest their payloads
 * differently on every product, so we flatten rather than guess a shape.
 * Arrays of scalars are joined; arrays of objects are indexed.
 * @param {*} value
 * @param {string=} prefix
 * @param {!Object<string,*>=} out
 * @return {!Object<string,*>}
 */
function flatten_(value, prefix, out) {
  out = out || {};
  prefix = prefix || '';
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    const scalars = value.every(function (v) {
      return v === null || typeof v !== 'object';
    });
    if (scalars) {
      out[prefix] = value.filter(function (v) { return v !== null && v !== ''; }).join(', ');
    } else {
      value.forEach(function (item, i) {
        flatten_(item, prefix ? prefix + '.' + i : String(i), out);
      });
    }
    return out;
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    Object.keys(value).forEach(function (key) {
      flatten_(value[key], prefix ? prefix + '.' + key : key, out);
    });
    return out;
  }

  out[prefix] = value;
  return out;
}

/**
 * The meaningful last segment of a flattened path: array indices and empty
 * segments are skipped, so "data.0.email" gives "email" and a header written
 * as "Contact No." still gives "Contact No".
 * @param {string} path
 * @return {string}
 */
function leafKey_(path) {
  const parts = String(path).split('.');
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim();
    if (part && !/^\d+$/.test(part)) return part;
  }
  return String(path);
}

// ==========================================================================
// src/02_Sheets.gs
// ==========================================================================

/**
 * Sheet plumbing: tab creation, header management, and reading/writing lead
 * rows by column name rather than by position, so a column can be inserted in
 * the spreadsheet without breaking the script.
 */

/** Column header -> lead object property. */
const COLUMN_TO_FIELD = {
  'Presenter': 'presenter',
  'Lead ID': 'leadId',
  'Received At': 'receivedAt',
  'Source': 'source',
  'Sub-Source': 'subSource',
  'Event Type': 'eventTypeLabel',
  'Event Type (Raw)': 'eventTypeRaw',
  'Full Name': 'fullName',
  'First Name': 'firstName',
  'Last Name': 'lastName',
  'Email': 'email',
  'Phone': 'phone',
  'Phone (Raw)': 'phoneRaw',
  'Company': 'company',
  'Event Date': 'eventDate',
  'Event Date (Raw)': 'eventDateRaw',
  'Guest Count': 'guestCount',
  'Venue / Location': 'venue',
  'Budget': 'budget',
  'Message': 'message',
  'Campaign': 'campaign',
  'Assigned To': 'assignedTo',
  'Status': 'status',
  'Touches': 'touches',
  'First Seen At': 'firstSeenAt',
  'Last Touch At': 'lastTouchAt',
  'All Sub-Sources': 'allSubSources',
  'Raw Ref': 'rawRef',
  'Matched On': 'matchedOn',
  'Original Lead ID': 'originalLeadId',
  'Original Tab': 'originalTab'
};

/**
 * Canonical fields an existing column may be bound to by its alias.
 *
 * Message is deliberately absent: a tab can carry several notes columns
 * (SALES NOTES, CLIENT NOTES, CONTACT METHOD), and writing the composed
 * message into whichever came first would overwrite one of them.
 */
const ALIAS_BINDABLE_FIELDS = {
  fullName: true, firstName: true, lastName: true, email: true, phone: true,
  company: true, eventType: true, eventDate: true, guestCount: true,
  venue: true, budget: true, campaign: true, presenter: true,
  assignedTo: true, status: true, receivedAt: true, source: true, subSource: true
};

/**
 * Where the alias dictionary's name for a field differs from the property the
 * lead record carries it in. The dictionary answers "what does this header
 * mean"; the lead record is what gets written. Without this translation a
 * bound column would read a property that does not exist and stay blank.
 */
const FIELD_TO_LEAD_PROPERTY = {
  eventType: 'eventTypeLabel'
};

let FIELD_COLUMNS_CACHE_ = {};

/**
 * Works out which column on a sheet serves each canonical field.
 *
 * A tab that has been in use for years does not use our column names. It says
 * "Contact number", not "Phone"; "Guests", not "Guest Count". Those columns
 * mean the same thing, so they are used as they are rather than left blank
 * beside a second column that duplicates them.
 *
 * Resolution runs in two passes so it is predictable: a column named exactly
 * like ours claims that field first, wherever it sits; then aliases fill what
 * is left, leftmost column winning.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {{byField: !Object<string,number>, byColumn: !Array<string>,
 *           headers: !Array<string>}}
 */
function fieldColumns_(sheet) {
  const name = sheet.getName();
  const width = Math.max(sheet.getLastColumn(), 1);
  const cached = FIELD_COLUMNS_CACHE_[name];
  if (cached && cached.width === width) return cached.value;

  const headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function (h) { return cleanText_(h); });

  const canonical = {};
  Object.keys(COLUMN_TO_FIELD).forEach(function (header) {
    canonical[squashKey_(header)] = COLUMN_TO_FIELD[header];
  });

  const byField = {};
  const byColumn = [];

  headers.forEach(function (header, i) {
    const field = canonical[squashKey_(header)];
    if (field && byField[field] === undefined) {
      byField[field] = i + 1;
      byColumn[i] = field;
    }
  });

  headers.forEach(function (header, i) {
    if (byColumn[i] || !header || isNoiseKey_(header)) return;
    const match = matchField_(header);
    if (!match.field || ALIAS_BINDABLE_FIELDS[match.field] !== true) return;
    const field = FIELD_TO_LEAD_PROPERTY[match.field] || match.field;
    if (byField[field] !== undefined) return;
    byField[field] = i + 1;
    byColumn[i] = field;
  });

  const value = { byField: byField, byColumn: byColumn, headers: headers };
  FIELD_COLUMNS_CACHE_[name] = { width: width, value: value };
  return value;
}

/** Forgets the cached bindings for a sheet whose header row just changed. */
function forgetFieldColumns_(sheetName) {
  delete FIELD_COLUMNS_CACHE_[sheetName];
}

/**
 * Returns a sheet, creating it with the given headers when absent. When the
 * sheet already exists, any header in `headers` that is missing is appended to
 * the right — existing columns and their data are never moved or deleted.
 * @param {string} name
 * @param {!Array<string>} headers
 * @return {!GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow_(sheet, headers.length);
    forgetFieldColumns_(name);
    return sheet;
  }
  ensureHeaders_(sheet, headers);
  return sheet;
}

/**
 * Adds any missing headers to the right of the existing ones.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {!Array<string>} headers
 */
function ensureHeaders_(sheet, headers) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function (h) { return cleanText_(h); });

  if (existing.join('') === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow_(sheet, headers.length);
    forgetFieldColumns_(sheet.getName());
    return;
  }

  const bindings = fieldColumns_(sheet);
  const have = {};
  existing.forEach(function (h) { if (h) have[squashKey_(h)] = true; });

  const missing = headers.filter(function (h) {
    if (have[squashKey_(h)]) return false;
    // A column already doing this job — "Contact number" for Phone — means we
    // do not add a second one beside it.
    const field = COLUMN_TO_FIELD[h];
    return !(field && bindings.byField[field] !== undefined);
  });
  if (!missing.length) return;

  // Append after the last populated column — never over a gap in the header row.
  const startCol = width + 1;
  const needed = startCol + missing.length - 1;
  if (sheet.getMaxColumns() < needed) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
  }
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  formatHeaderRow_(sheet, needed);
  forgetFieldColumns_(sheet.getName());
}

/** Bolds, freezes and sizes the header row. */
function formatHeaderRow_(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#1c3d5a')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);
}

/**
 * Header text -> 1-based column number for a sheet.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {!Object<string,number>} Keyed by squashed header.
 */
function headerMap_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const map = {};
  headers.forEach(function (header, i) {
    const key = squashKey_(header);
    if (key && map[key] === undefined) map[key] = i + 1;
  });
  return map;
}

/**
 * Renders a lead object into a row array matching the sheet's own header order.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {!Object} lead
 * @return {!Array<*>}
 */
function leadToRow_(sheet, lead) {
  const bindings = fieldColumns_(sheet);
  return bindings.headers.map(function (header, i) {
    const field = bindings.byColumn[i];
    if (!field) return '';
    const value = lead[field];
    return (value === undefined || value === null) ? '' : value;
  });
}

/**
 * Appends a lead to a sheet and returns the row number written.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {!Object} lead
 * @return {number}
 */
function appendLead_(sheet, lead) {
  const row = leadToRow_(sheet, lead);
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/**
 * Locates a lead by id. `hintRow` (from the index) is checked first; a full
 * column scan is the fallback, so manually inserted or deleted rows in a team
 * tab cannot desynchronise the automation.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} leadId
 * @param {number=} hintRow
 * @return {number} 1-based row, or 0 when not found.
 */
function findLeadRow_(sheet, leadId, hintRow) {
  const idCol = fieldColumns_(sheet).byField.leadId;
  if (!idCol) return 0;

  if (hintRow && hintRow > 1 && hintRow <= sheet.getLastRow()) {
    if (cleanText_(sheet.getRange(hintRow, idCol).getValue()) === leadId) return hintRow;
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (cleanText_(ids[i][0]) === leadId) return i + 2;
  }
  return 0;
}

/**
 * Writes named fields into an existing row, leaving every other cell alone.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} row
 * @param {!Object<string,*>} updates Keyed by column header.
 */
function updateRowCells_(sheet, row, updates) {
  const bindings = fieldColumns_(sheet);
  const map = headerMap_(sheet);
  Object.keys(updates).forEach(function (header) {
    const field = COLUMN_TO_FIELD[header];
    const col = (field && bindings.byField[field]) || map[squashKey_(header)];
    if (col) sheet.getRange(row, col).setValue(updates[header]);
  });
}

/**
 * Reads one row back as a lead-shaped object.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} row
 * @return {!Object}
 */
function readLeadRow_(sheet, row) {
  const bindings = fieldColumns_(sheet);
  const values = sheet.getRange(row, 1, 1, bindings.headers.length).getValues()[0];
  const lead = {};
  bindings.byColumn.forEach(function (field, i) {
    if (field) lead[field] = values[i];
  });
  return lead;
}

/** @return {!Array<!Object>} Every configured event type plus the fallback. */
function allEventTypes_() {
  return EVENT_TYPES.concat([FALLBACK_EVENT_TYPE]);
}

/** @return {!Array<string>} The shared tab for each event type. */
function teamTabNames_() {
  return allEventTypes_().map(function (t) { return t.tab; });
}

/**
 * Every tab a routed lead can land in: the shared event-type tabs plus each
 * salesperson's own tab from the _Team roster.
 * @return {!Array<string>}
 */
function leadTabNames_() {
  const names = teamTabNames_();
  loadTeam_().forEach(function (member) {
    if (member.tab && names.indexOf(member.tab) === -1) names.push(member.tab);
  });
  return names;
}

// ==========================================================================
// src/03_Normalize.gs
// ==========================================================================

/**
 * Value normalisation. Everything that turns messy human input into something
 * comparable lives here — this is what makes deduplication and routing work.
 */

/**
 * @param {*} raw
 * @return {string} Lowercased, trimmed address, or '' when it is not an email.
 */
function normalizeEmail_(raw) {
  const text = cleanText_(raw).toLowerCase().replace(/^mailto:/, '');
  if (!/^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i.test(text)) return '';
  return text;
}

/**
 * The address used for duplicate matching only. The original is what gets
 * stored and mailed; this collapses Gmail-style +tags so that
 * "maria+fair@gmail.com" and "maria@gmail.com" are recognised as one person.
 * @param {string} email
 * @return {string}
 */
function emailDedupeKey_(email) {
  if (!email) return '';
  if (!settingIsOn_('Dedupe Ignore Plus Tags')) return email;
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  return parts[0].split('+')[0] + '@' + parts[1];
}

/**
 * Normalises a phone number to +<country><subscriber>.
 *
 * Handles the shapes people actually type in Philippine forms: 0917 123 4567,
 * 63 917 123 4567, +63-917-123-4567, 9171234567, (02) 8123 4567. Numbers that
 * already carry a different country code are preserved as-is.
 * @param {*} raw
 * @param {string=} countryCode Digits only, e.g. "63".
 * @return {string} E.164-ish string, or '' when there is no usable number.
 */
function normalizePhone_(raw, countryCode) {
  const cc = String(countryCode || setting_('Default Country Code', '63')).replace(/\D/g, '');
  let text = cleanText_(raw);
  if (!text) return '';

  // Keep only the first number when a field holds several.
  text = text.split(/\s*(?:\/|,|;| or | and )\s*/i)[0];

  const hasPlus = /^\s*\+/.test(text);
  let digits = text.replace(/\D/g, '');
  if (!digits) return '';

  if (hasPlus || /^00/.test(text)) {
    digits = digits.replace(/^00/, '');
  } else if (digits.charAt(0) === '0') {
    digits = cc + digits.slice(1);
  } else if (cc && digits.indexOf(cc) === 0 && digits.length > cc.length + 6) {
    // Already prefixed with the country code.
  } else if (digits.length <= 10) {
    digits = cc + digits;
  }

  if (digits.length < 8 || digits.length > 15) return '';
  return '+' + digits;
}

/**
 * Splits a full name into first and last. A single token is treated as the
 * first name; anything after the first token is the last name.
 * @param {string} fullName
 * @return {{firstName: string, lastName: string}}
 */
function splitName_(fullName) {
  const parts = cleanText_(fullName).split(' ').filter(String);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Title-cases a name that arrived as ALL CAPS or all lowercase. */
function tidyName_(raw) {
  const text = cleanText_(raw);
  if (!text) return '';
  if (text !== text.toUpperCase() && text !== text.toLowerCase()) return text;
  return text.toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
}

/**
 * Best-effort date parsing. Returns yyyy-MM-dd when the value is a recognisable
 * date, otherwise the cleaned original text so nothing is silently lost.
 * @param {*} raw
 * @return {string}
 */
function normalizeDate_(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return formatDate_(raw);
  const text = cleanText_(raw);
  if (!text) return '';

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return buildDate_(+iso[1], +iso[2], +iso[3], text);

  // Slash / dot / dash forms. Month-first is assumed (US and Wix default);
  // when the first number cannot be a month, day-first is used instead.
  const parts = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (parts) {
    let a = +parts[1], b = +parts[2], year = +parts[3];
    if (year < 100) year += 2000;
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    return buildDate_(year, month, day, text);
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime()) && /\d{4}/.test(text)) return formatDate_(parsed);
  return text;
}

/**
 * Decides whether a date written by a human can be read with certainty.
 *
 * "03/15/2027" can only be March 15th; "15/03/2027" can only be the same day
 * written the other way round; but "03/04/2027" is March 4th in one person's
 * sheet and April 3rd in another's. Where several people have typed into the
 * same column over the years, the only honest answer for that third case is
 * "ask a human" — guessing moves real bookings by weeks.
 *
 * @param {*} raw
 * @return {{status: string, value: string, original: string}}
 *     status is 'iso' (value holds yyyy-MM-dd), 'ambiguous' (day and month
 *     could swap), or 'unreadable' (not a date at all).
 */
function classifyDate_(raw) {
  const original = cleanText_(raw);
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return { status: 'iso', value: formatDate_(raw), original: original };
  }
  if (!original) return { status: 'unreadable', value: '', original: '' };

  const iso = original.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const built = buildDate_(+iso[1], +iso[2], +iso[3], '');
    return built
      ? { status: 'iso', value: built, original: original }
      : { status: 'unreadable', value: '', original: original };
  }

  const parts = original.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\s*$/);
  if (parts) {
    let a = +parts[1], b = +parts[2], year = +parts[3];
    if (year < 100) year += 2000;
    if (a > 12 && b > 12) return { status: 'unreadable', value: '', original: original };
    // 06/06/2027 is the sixth of June whichever way round it was meant.
    if (a === b) {
      const same = buildDate_(year, a, b, '');
      return same ? { status: 'iso', value: same, original: original }
                  : { status: 'unreadable', value: '', original: original };
    }
    if (a > 12) {
      const built = buildDate_(year, b, a, '');
      return built ? { status: 'iso', value: built, original: original }
                   : { status: 'unreadable', value: '', original: original };
    }
    if (b > 12) {
      const built = buildDate_(year, a, b, '');
      return built ? { status: 'iso', value: built, original: original }
                   : { status: 'unreadable', value: '', original: original };
    }
    return { status: 'ambiguous', value: '', original: original };
  }

  // Anything with a month name or a full timestamp reads only one way.
  const parsed = new Date(original);
  if (!isNaN(parsed.getTime()) && /\d{4}/.test(original) && /[A-Za-z]/.test(original)) {
    return { status: 'iso', value: formatDate_(parsed), original: original };
  }
  return { status: 'unreadable', value: '', original: original };
}

/** @return {string} yyyy-MM-dd, or the fallback text when the parts are invalid. */
function buildDate_(year, month, day, fallback) {
  if (!year || !month || !day || month > 12 || day > 31) return fallback;
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return fallback;
  return formatDate_(date);
}

/**
 * Pulls a guest count out of text like "around 150 pax" or "100-150".
 * @param {*} raw
 * @return {string} A number as text, a range, or the cleaned original.
 */
function normalizeGuestCount_(raw) {
  if (typeof raw === 'number') return String(Math.round(raw));
  const text = cleanText_(raw);
  if (!text) return '';
  const range = text.match(/(\d[\d,]*)\s*(?:-|to|–)\s*(\d[\d,]*)/i);
  if (range) return range[1].replace(/,/g, '') + '-' + range[2].replace(/,/g, '');
  const single = text.match(/\d[\d,]*/);
  return single ? single[0].replace(/,/g, '') : text;
}

/**
 * Resolves free-text event wording to one of the configured event types.
 *
 * Matching order: exact label or key, then keyword containment scored by
 * keyword length so the most specific wording wins ("christmas party" beats
 * "party", "bridal fair" beats "fair"). Unmatched input returns the fallback.
 *
 * @param {*} raw Whatever the form or worksheet supplied.
 * @param {!Array<string>=} extraContext Other text worth searching, e.g. the
 *     message body or the sub-source name.
 * @return {!Object} An entry from EVENT_TYPES, or FALLBACK_EVENT_TYPE.
 */
function resolveEventType_(raw, extraContext) {
  const candidates = allEventTypes_();
  const primary = cleanText_(raw).toLowerCase();

  if (primary) {
    const squashed = squashKey_(primary);
    for (let i = 0; i < candidates.length; i++) {
      if (squashKey_(candidates[i].label) === squashed || candidates[i].key === squashed) {
        return candidates[i];
      }
    }
  }

  const haystacks = [primary].concat(
    (extraContext || []).map(function (t) { return cleanText_(t).toLowerCase(); })
  ).filter(String);

  let best = null;
  let bestScore = 0;
  haystacks.forEach(function (haystack, depth) {
    EVENT_TYPES.forEach(function (type) {
      type.keywords.forEach(function (keyword) {
        if (haystack.indexOf(keyword) === -1) return;
        // Longer keywords are more specific; later haystacks are weaker evidence.
        const score = keyword.length * 10 - depth;
        if (score > bestScore) {
          bestScore = score;
          best = type;
        }
      });
    });
  });

  return best || FALLBACK_EVENT_TYPE;
}

/** @return {!Object} The event type whose tab matches `tabName`, or the fallback. */
function eventTypeByTab_(tabName) {
  const match = allEventTypes_().filter(function (t) { return t.tab === tabName; })[0];
  return match || FALLBACK_EVENT_TYPE;
}

// ==========================================================================
// src/04_Mapping.gs
// ==========================================================================

/**
 * Turning an unknown payload into a canonical lead.
 *
 * Neither Wix, Google Ads nor a bridal-fair organiser agrees on what to call a
 * phone number. Rather than hard-coding one mapping per form, every incoming
 * record is flattened to key/value pairs and each key is matched against the
 * alias dictionary in 00_Config.gs. Keys that match nothing are not discarded —
 * they are folded into the Message column so a new question on a form never
 * loses its answer.
 */

let ALIAS_INDEX_ = null;

/**
 * squashed alias -> canonical field name.
 * @return {!Object<string,string>}
 */
function aliasIndex_() {
  if (ALIAS_INDEX_) return ALIAS_INDEX_;
  const index = {};
  Object.keys(FIELD_ALIASES).forEach(function (field) {
    FIELD_ALIASES[field].forEach(function (alias) {
      const key = squashKey_(alias);
      if (key && index[key] === undefined) index[key] = field;
    });
    index[squashKey_(field)] = field;
  });
  ALIAS_INDEX_ = index;
  return index;
}

/** @return {boolean} True for plumbing keys that should never reach a sales rep. */
function isNoiseKey_(key) {
  const squashed = squashKey_(key);
  if (!squashed) return true;
  return NOISE_KEYS.some(function (noise) {
    const n = squashKey_(noise);
    return squashed === n || squashed.indexOf(n) !== -1;
  });
}

/**
 * Matches one incoming key to a canonical field.
 * @param {string} key
 * @return {{field: string, quality: number}} quality 2 = exact, 1 = contained,
 *     0 = no match.
 */
function matchField_(key) {
  const index = aliasIndex_();
  const squashed = squashKey_(key);
  if (!squashed) return { field: '', quality: 0 };
  if (index[squashed]) return { field: index[squashed], quality: 2 };

  // Question-style headers: "Whattypeofeventareyouplanning" contains "typeofevent".
  let best = '';
  let bestLength = 0;
  Object.keys(index).forEach(function (alias) {
    if (alias.length < 5 || alias.length <= bestLength) return;
    if (squashed.indexOf(alias) !== -1) {
      best = index[alias];
      bestLength = alias.length;
    }
  });
  if (best) return { field: best, quality: 1 };

  for (let i = 0; i < FIELD_SUFFIX_RULES.length; i++) {
    const rule = FIELD_SUFFIX_RULES[i];
    if (squashed.length > rule.suffix.length &&
        squashed.slice(-rule.suffix.length) === rule.suffix) {
      return { field: rule.field, quality: 1 };
    }
  }
  return { field: '', quality: 0 };
}

/**
 * Maps a flat key/value record onto canonical fields.
 *
 * Two columns can legitimately want the same destination — a worksheet with
 * both SALES NOTES and CLIENT NOTES, or two phone columns for a mobile and a
 * landline. Nothing is dropped when that happens: notes columns are all kept
 * and labelled, and for every other field the weaker match is demoted into the
 * Message column rather than discarded.
 *
 * @param {!Object<string,*>} flat Output of flatten_().
 * @return {{fields: !Object<string,string>,
 *           extras: !Array<{label: string, value: string}>,
 *           messages: !Array<{label: string, value: string}>}}
 */
function mapRecord_(flat) {
  const fields = {};
  const quality = {};
  const labels = {};
  const extras = [];
  const messages = [];

  Object.keys(flat).forEach(function (path) {
    const value = cleanText_(flat[path]);
    if (value === '') return;

    const label = leafKey_(path);
    if (isNoiseKey_(label)) return;

    const pretty = humanizeKey_(label);
    const match = matchField_(label);

    if (!match.field) {
      extras.push({ label: pretty, value: value });
      return;
    }

    // Free text accumulates instead of competing for one slot.
    if (match.field === 'message') {
      messages.push({ label: pretty, value: value });
      if (fields.message === undefined) fields.message = value;
      return;
    }

    if (quality[match.field] === undefined) {
      fields[match.field] = value;
      quality[match.field] = match.quality;
      labels[match.field] = pretty;
    } else if (match.quality > quality[match.field]) {
      extras.push({ label: labels[match.field], value: fields[match.field] });
      fields[match.field] = value;
      quality[match.field] = match.quality;
      labels[match.field] = pretty;
    } else {
      extras.push({ label: pretty, value: value });
    }
  });

  return { fields: fields, extras: extras, messages: messages };
}

/**
 * Assembles the Message column.
 *
 * A single notes column reads as plain text, the way the person wrote it.
 * Several get labelled with their own headers, so a rep can tell the client's
 * words from an internal note. Anything that matched no field at all follows,
 * labelled the same way — that is what "nothing is dropped" means in practice.
 *
 * @param {!Array<{label: string, value: string}>} notes
 * @param {!Array<{label: string, value: string}>=} extras
 * @return {string}
 */
function composeMessage_(notes, extras) {
  const parts = (notes || []).length === 1
    ? [notes[0].value]
    : (notes || []).map(function (note) { return note.label + ': ' + note.value; });
  (extras || []).forEach(function (extra) {
    parts.push(extra.label + ': ' + extra.value);
  });
  return parts.join('\n');
}

/**
 * Turns a key or header into a label for the Message column:
 * "eventDate" and "event_date" both become "Event Date", and a shouted
 * worksheet header like "SALES NOTES" becomes "Sales Notes" rather than
 * shouting at the rep reading it. Mixed-case headers are left alone, so an
 * acronym someone typed deliberately survives.
 * @param {string} key
 * @return {string}
 */
function humanizeKey_(key) {
  const spaced = String(key)
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  const text = /[a-z]/.test(spaced) ? spaced : spaced.toLowerCase();
  return text.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
}

/**
 * Builds the canonical lead record written to the sheets.
 *
 * @param {!Object} input
 * @param {!Object<string,string>} input.fields Mapped canonical fields.
 * @param {!Array<{label: string, value: string}>=} input.extras Unmapped answers.
 * @param {!Array<{label: string, value: string}>=} input.messages Every column
 *     that mapped to free text, in the order it appeared.
 * @param {string} input.source One of SOURCES.
 * @param {string} input.subSource Form or fair name as received.
 * @param {string=} input.rawRef Pointer into the _Raw tab.
 * @param {string=} input.receivedAt Overrides "now" (fair worksheets carry
 *     their own submission timestamps).
 * @param {string=} input.defaultEventType Event wording to fall back on when
 *     the record itself does not say — e.g. "Wedding" for a bridal fair.
 * @param {boolean=} input.preferRecordSubSource Let a sub-source carried by the
 *     record itself win over the caller's. Historical rows know their own
 *     source; a fair worksheet does not, so the fair name wins there.
 * @param {boolean=} input.preferRecordSource The same, for the source.
 * @return {!Object} A lead ready for dedupe and routing.
 */
function buildLead_(input) {
  const fields = input.fields || {};
  const extras = input.extras || [];

  const subSource = input.preferRecordSubSource
    ? (fields.subSource || input.subSource)
    : (input.subSource || fields.subSource);
  const source = input.preferRecordSource
    ? (cleanText_(fields.source) || input.source)
    : input.source;
  const subSourceInfo = resolveSubSource_(source, subSource, input.defaultEventType);

  let fullName = tidyName_(fields.fullName);
  let firstName = tidyName_(fields.firstName);
  let lastName = tidyName_(fields.lastName);
  if (!fullName && (firstName || lastName)) {
    fullName = cleanText_(firstName + ' ' + lastName);
  } else if (fullName && !firstName && !lastName) {
    const split = splitName_(fullName);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  const notes = input.messages || (fields.message ? [{ label: '', value: fields.message }] : []);
  const message = composeMessage_(notes, extras);

  const eventType = resolveEventType_(
    fields.eventType || subSourceInfo.defaultEventType || input.defaultEventType,
    [subSourceInfo.label, fields.message, message]
  );

  const email = normalizeEmail_(fields.email);
  const phone = normalizePhone_(fields.phone);
  const receivedAt = input.receivedAt || nowStamp_();

  return {
    presenter: cleanText_(fields.presenter),
    leadId: makeLeadId_(),
    receivedAt: receivedAt,
    source: subSourceInfo.source,
    subSource: subSourceInfo.label,
    eventTypeKey: eventType.key,
    eventTypeLabel: eventType.label,
    eventTypeTab: eventType.tab,
    eventTypeRaw: cleanText_(fields.eventType),
    fullName: fullName,
    firstName: firstName,
    lastName: lastName,
    email: email,
    phone: phone,
    phoneRaw: cleanText_(fields.phone),
    company: cleanText_(fields.company),
    eventDate: normalizeDate_(fields.eventDate),
    eventDateRaw: cleanText_(fields.eventDate),
    guestCount: normalizeGuestCount_(fields.guestCount),
    venue: cleanText_(fields.venue),
    budget: cleanText_(fields.budget),
    message: message,
    campaign: cleanText_(fields.campaign),
    assignedTo: cleanText_(fields.assignedTo),
    status: cleanText_(fields.status) || 'New',
    touches: 1,
    firstSeenAt: receivedAt,
    lastTouchAt: receivedAt,
    allSubSources: subSourceInfo.label,
    rawRef: input.rawRef || '',
    emailKey: emailDedupeKey_(email),
    phoneKey: phone
  };
}

/**
 * Looks a form or fair up in the _Sources registry, adding it when it is new.
 *
 * This is how sub-sources get added "along the way": the first lead from an
 * unrecognised form registers itself with the raw identifier as its name, and
 * the team can then give it a friendlier display name or a default event type
 * without touching any code.
 *
 * @param {string} source One of SOURCES.
 * @param {string} rawSubSource The identifier as received.
 * @param {string=} seedEventType Default event type to store when this
 *     sub-source is being registered for the first time.
 * @return {{source: string, label: string, defaultEventType: string}}
 */
function resolveSubSource_(source, rawSubSource, seedEventType) {
  const raw = cleanText_(rawSubSource) || 'Unknown Form';
  const sheet = getOrCreateSheet_(SHEETS.sources, SOURCES_COLUMNS);
  const lastRow = sheet.getLastRow();
  const map = headerMap_(sheet);
  const col = {
    source: map[squashKey_('Source')],
    raw: map[squashKey_('Sub-Source (as received)')],
    label: map[squashKey_('Display Name')],
    eventType: map[squashKey_('Default Event Type')],
    active: map[squashKey_('Active')],
    firstSeen: map[squashKey_('First Seen')],
    lastSeen: map[squashKey_('Last Seen')],
    count: map[squashKey_('Lead Count')]
  };

  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (let i = 0; i < values.length; i++) {
      if (squashKey_(values[i][col.raw - 1]) !== squashKey_(raw)) continue;
      const row = i + 2;
      sheet.getRange(row, col.lastSeen).setValue(nowStamp_());
      sheet.getRange(row, col.count).setValue((Number(values[i][col.count - 1]) || 0) + 1);
      return {
        source: cleanText_(values[i][col.source - 1]) || source,
        label: cleanText_(values[i][col.label - 1]) || raw,
        defaultEventType: cleanText_(values[i][col.eventType - 1])
      };
    }
  }

  const newRow = new Array(sheet.getLastColumn()).fill('');
  newRow[col.source - 1] = source;
  newRow[col.raw - 1] = raw;
  newRow[col.label - 1] = raw;
  newRow[col.eventType - 1] = cleanText_(seedEventType);
  newRow[col.active - 1] = 'yes';
  newRow[col.firstSeen - 1] = nowStamp_();
  newRow[col.lastSeen - 1] = nowStamp_();
  newRow[col.count - 1] = 1;
  sheet.appendRow(newRow);
  log_('INFO', 'sources', 'Registered new sub-source', { source: source, subSource: raw });

  return { source: source, label: raw, defaultEventType: cleanText_(seedEventType) };
}

/** Columns of the _Sources registry. */
const SOURCES_COLUMNS = [
  'Source',
  'Sub-Source (as received)',
  'Display Name',
  'Default Event Type',
  'Active',
  'First Seen',
  'Last Seen',
  'Lead Count',
  'Notes'
];

// ==========================================================================
// src/05_Dedupe.gs
// ==========================================================================

/**
 * Duplicate detection.
 *
 * A lead is a duplicate when its normalised email OR its normalised phone has
 * been seen before (configurable via the "Dedupe On" setting). Matching runs
 * against the _Index tab, which maps each contact key to the lead id and the
 * team tab and row it lives in — so a rep can sort or filter a team tab
 * without the automation losing track of anything.
 */

const INDEX_COLUMNS = ['Key', 'Lead ID', 'Tab', 'Row', 'Updated At'];

let INDEX_CACHE_ = null;

/**
 * Loads the dedupe index into memory for this execution.
 * @return {{byKey: !Object<string,!Object>, rowsByLeadId: !Object<string,!Array<number>>}}
 */
function loadIndex_() {
  if (INDEX_CACHE_) return INDEX_CACHE_;
  const sheet = getOrCreateSheet_(SHEETS.index, INDEX_COLUMNS);
  const cache = { byKey: {}, rowsByLeadId: {}, sheet: sheet };

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, INDEX_COLUMNS.length).getValues();
    values.forEach(function (row, i) {
      const key = cleanText_(row[0]);
      if (!key) return;
      const entry = {
        key: key,
        leadId: cleanText_(row[1]),
        tab: cleanText_(row[2]),
        row: Number(row[3]) || 0,
        indexRow: i + 2
      };
      cache.byKey[key] = entry;
      if (!cache.rowsByLeadId[entry.leadId]) cache.rowsByLeadId[entry.leadId] = [];
      cache.rowsByLeadId[entry.leadId].push(entry);
    });
  }
  INDEX_CACHE_ = cache;
  return cache;
}

/** @return {!Array<string>} Which contact fields to dedupe on, per _Settings. */
function dedupeFields_() {
  return String(setting_('Dedupe On', 'email,phone'))
    .toLowerCase()
    .split(',')
    .map(function (f) { return f.trim(); })
    .filter(String);
}

/**
 * The index keys a lead occupies, most reliable first.
 * @param {!Object} lead
 * @return {!Array<{key: string, matchedOn: string}>}
 */
function dedupeKeys_(lead) {
  const fields = dedupeFields_();
  const keys = [];
  if (fields.indexOf('email') !== -1 && lead.emailKey) {
    keys.push({ key: 'email:' + lead.emailKey, matchedOn: 'Email' });
  }
  if (fields.indexOf('phone') !== -1 && lead.phoneKey) {
    keys.push({ key: 'phone:' + lead.phoneKey, matchedOn: 'Phone' });
  }
  if (fields.indexOf('date') !== -1 && lead.eventDate && (lead.emailKey || lead.phoneKey)) {
    keys.push({
      key: 'contactdate:' + (lead.emailKey || lead.phoneKey) + '|' + lead.eventDate,
      matchedOn: 'Email/Phone + Event Date'
    });
  }
  return keys;
}

/**
 * @param {!Object} lead
 * @return {?{matchedOn: string, entry: !Object}} The existing lead this one
 *     duplicates, or null when it is new.
 */
function findDuplicate_(lead) {
  const index = loadIndex_();
  const keys = dedupeKeys_(lead);
  for (let i = 0; i < keys.length; i++) {
    const hit = index.byKey[keys[i].key];
    if (hit) return { matchedOn: keys[i].matchedOn, entry: hit };
  }
  return null;
}

/**
 * Records where a lead lives so future arrivals can be matched against it.
 * @param {!Object} lead
 * @param {string} tab
 * @param {number} row
 */
function indexLead_(lead, tab, row) {
  const index = loadIndex_();
  const stamp = nowStamp_();
  dedupeKeys_(lead).forEach(function (k) {
    if (index.byKey[k.key]) return;
    index.sheet.appendRow([k.key, lead.leadId, tab, row, stamp]);
    const entry = {
      key: k.key,
      leadId: lead.leadId,
      tab: tab,
      row: row,
      indexRow: index.sheet.getLastRow()
    };
    index.byKey[k.key] = entry;
    if (!index.rowsByLeadId[lead.leadId]) index.rowsByLeadId[lead.leadId] = [];
    index.rowsByLeadId[lead.leadId].push(entry);
  });
}

/**
 * Points every index entry for a lead at a new tab and row. Used when an
 * Unassigned lead is promoted to a real team tab.
 * @param {string} leadId
 * @param {string} tab
 * @param {number} row
 */
function moveIndexEntries_(leadId, tab, row) {
  const index = loadIndex_();
  const entries = index.rowsByLeadId[leadId] || [];
  const stamp = nowStamp_();
  entries.forEach(function (entry) {
    index.sheet.getRange(entry.indexRow, 3, 1, 3).setValues([[tab, row, stamp]]);
    entry.tab = tab;
    entry.row = row;
  });
}

/**
 * Adds the incoming lead's contact keys to an existing lead's index entries.
 * A repeat inquiry often carries a phone number the first submission lacked;
 * capturing it means the next arrival from either channel is caught.
 * @param {!Object} incoming
 * @param {!Object} entry The matched index entry.
 */
function mergeIndexKeys_(incoming, entry) {
  const index = loadIndex_();
  const stamp = nowStamp_();
  dedupeKeys_(incoming).forEach(function (k) {
    if (index.byKey[k.key]) return;
    index.sheet.appendRow([k.key, entry.leadId, entry.tab, entry.row, stamp]);
    const added = {
      key: k.key,
      leadId: entry.leadId,
      tab: entry.tab,
      row: entry.row,
      indexRow: index.sheet.getLastRow()
    };
    index.byKey[k.key] = added;
    if (!index.rowsByLeadId[entry.leadId]) index.rowsByLeadId[entry.leadId] = [];
    index.rowsByLeadId[entry.leadId].push(added);
  });
}

/**
 * Rebuilds the index from what is actually in the team tabs. Safe to run any
 * time; it is the repair tool for a spreadsheet that was edited by hand.
 * @return {number} Number of leads indexed.
 */
function rebuildIndex() {
  return withLock_(function () {
    INDEX_CACHE_ = null;
    const sheet = getOrCreateSheet_(SHEETS.index, INDEX_COLUMNS);
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, INDEX_COLUMNS.length).clearContent();
    }
    INDEX_CACHE_ = null;

    const rows = [];
    const seen = {};
    let leads = 0;

    leadTabNames_().forEach(function (tabName) {
      const tab = getSpreadsheet_().getSheetByName(tabName);
      if (!tab || tab.getLastRow() < 2) return;
      const map = headerMap_(tab);
      const width = tab.getLastColumn();
      const values = tab.getRange(2, 1, tab.getLastRow() - 1, width).getValues();

      values.forEach(function (row, i) {
        const leadId = cleanText_(row[map[squashKey_('Lead ID')] - 1]);
        if (!leadId) return;
        leads++;
        const stub = {
          emailKey: emailDedupeKey_(normalizeEmail_(row[map[squashKey_('Email')] - 1])),
          phoneKey: normalizePhone_(row[map[squashKey_('Phone')] - 1]),
          eventDate: cleanText_(row[map[squashKey_('Event Date')] - 1])
        };
        dedupeKeys_(stub).forEach(function (k) {
          if (seen[k.key]) return;
          seen[k.key] = true;
          rows.push([k.key, leadId, tabName, i + 2, nowStamp_()]);
        });
      });
    });

    if (rows.length) sheet.getRange(2, 1, rows.length, INDEX_COLUMNS.length).setValues(rows);
    INDEX_CACHE_ = null;
    log_('INFO', 'dedupe', 'Rebuilt index', { leads: leads, keys: rows.length });
    return leads;
  });
}

// ==========================================================================
// src/06_Router.gs
// ==========================================================================

/**
 * Routing and distribution: which tab a lead lands in, which rep owns it, and
 * what happens when a lead we already have comes back through another channel.
 */

/**
 * Writes a brand-new lead to the tab of the salesperson who gets it, and to
 * the All Leads master log.
 *
 * The destination is the assignee's own tab when someone on the roster covers
 * this event type; otherwise the event type's shared team tab, so a lead is
 * never lost because the roster is incomplete.
 *
 * @param {!Object} lead
 * @return {{tab: string, row: number}}
 */
function routeLead_(lead) {
  const assignment = pickAssignee_(lead);
  const tabName = (assignment && assignment.tab) || lead.eventTypeTab || FALLBACK_EVENT_TYPE.tab;
  const teamSheet = getOrCreateSheet_(tabName, LEAD_COLUMNS);

  if (assignment && !lead.assignedTo) lead.assignedTo = assignment.name;
  // The row this is about to land on decides the presenter. Reading it before
  // the append is safe: the whole intake runs under the document lock.
  if (assignment && !lead.presenter) {
    lead.presenter = presenterFor_(
      lead.eventTypeLabel, teamSheet.getLastRow() + 1, assignment.name);
  }

  const row = appendLead_(teamSheet, lead);
  appendLead_(getOrCreateSheet_(SHEETS.allLeads, LEAD_COLUMNS), lead);
  indexLead_(lead, tabName, row);

  if (assignment) recordAssignment_(assignment);
  notifyTeam_(lead, tabName, assignment);
  return { tab: tabName, row: row };
}

let TEAM_CACHE_ = null;

/**
 * Reads the _Team roster.
 * @return {!Array<!Object>} One entry per row, in sheet order.
 */
function loadTeam_() {
  if (TEAM_CACHE_) return TEAM_CACHE_;
  const sheet = getOrCreateSheet_(SHEETS.team, TEAM_COLUMNS);
  const members = [];

  if (sheet.getLastRow() > 1) {
    const map = headerMap_(sheet);
    const width = sheet.getLastColumn();
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
    const at = function (row, header) {
      const col = map[squashKey_(header)];
      return col ? row[col - 1] : '';
    };

    values.forEach(function (row, i) {
      const name = cleanText_(at(row, 'Salesperson'));
      const tab = cleanText_(at(row, 'Tab Name')) || name;
      if (!name && !tab) return;
      members.push({
        name: name || tab,
        tab: tab,
        email: cleanText_(at(row, 'Email')),
        eventTypes: String(at(row, 'Event Types') || '')
          .split(',')
          .map(function (e) { return e.trim(); })
          .filter(String),
        active: /^(yes|y|true|1|on)$/i.test(cleanText_(at(row, 'Active'))),
        count: Number(at(row, 'Assigned Count')) || 0,
        lastAt: cleanText_(at(row, 'Last Assigned At')),
        row: i + 2
      });
    });
  }
  TEAM_CACHE_ = members;
  return members;
}

/** @return {!Array<!Object>} Active roster members who cover an event type. */
function membersFor_(eventTypeLabel) {
  const wanted = squashKey_(eventTypeLabel);
  return loadTeam_().filter(function (member) {
    if (!member.active || !member.tab) return false;
    return member.eventTypes.some(function (label) {
      return label === '*' || squashKey_(label) === wanted;
    });
  });
}

/**
 * Picks who gets a lead.
 *
 * Round robin is implemented as "fewest leads so far wins", which produces the
 * same strict rotation as a pointer while staying correct when someone is
 * added, deactivated, or covers more than one event type. Ties break on who
 * was assigned longest ago, then alphabetically, so the outcome is
 * reproducible and can be explained to whoever thinks they were skipped.
 *
 * A lead that already names an owner goes to that person if they are on the
 * roster — an imported worksheet may carry its own "Assigned To" column.
 *
 * @param {!Object} lead
 * @return {?Object} The roster entry, or null when nobody covers this type.
 */
function pickAssignee_(lead) {
  const named = namedMember_(lead.assignedTo);
  if (named) return named;
  if (!settingIsOn_('Round Robin Assignment')) return null;

  const candidates = membersFor_(lead.eventTypeLabel);
  if (!candidates.length) return null;

  candidates.sort(function (a, b) {
    if (a.count !== b.count) return a.count - b.count;
    if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? -1 : 1;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  return candidates[0];
}

/**
 * How presenters are decided for one event type.
 *
 * `Presenters - <Event Type>` in _Settings overrides the general `Presenters`
 * list, and takes one of three forms:
 *
 *   AJ, Pam, Mhay, Vanessa   a sequence, written in rotation down the column
 *   caller                   the caller presents their own — corporate works
 *                            this way, where Shane and Abi do both jobs
 *   none                     no presenter on these leads
 *
 * Left blank, the event type follows the general `Presenters` list.
 *
 * @param {string} eventTypeLabel
 * @return {{mode: string, list: !Array<string>}} mode is 'list', 'caller' or 'none'.
 */
function presenterRule_(eventTypeLabel) {
  const settings = getSettings_();
  const key = 'Presenters - ' + eventTypeLabel;
  let raw = cleanText_(
    Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : '');
  if (!raw) raw = cleanText_(setting_('Presenters', ''));

  const token = squashKey_(raw);
  if (!raw || token === 'none') return { mode: 'none', list: [] };
  if (token === 'caller' || token === 'self') return { mode: 'caller', list: [] };

  const list = raw.split(',').map(function (name) { return name.trim(); }).filter(String);
  return list.length ? { mode: 'list', list: list } : { mode: 'none', list: [] };
}

/**
 * The presenter a row belongs to.
 *
 * Where a sequence applies, it runs down each caller's tab by row — row 2 to
 * the first presenter, row 3 to the second, back to the top after the last.
 * The caller works the lead and hands it to whoever their row names, so the
 * split is decided by the sheet rather than negotiated each time.
 *
 * Because it is derived from the row number and written into the cell, the
 * sequence stays intact however many leads arrive, and a row keeps its
 * presenter when the tab is sorted.
 *
 * @param {string} eventTypeLabel Which rule applies.
 * @param {number} row 1-based sheet row; row 1 is the header.
 * @param {string=} callerName Used when the caller presents their own.
 * @return {string} A name, or '' when this event type has no presenters.
 */
function presenterFor_(eventTypeLabel, row, callerName) {
  const rule = presenterRule_(eventTypeLabel);
  if (rule.mode === 'none' || row < 2) return '';
  if (rule.mode === 'caller') return cleanText_(callerName);
  return rule.list[(row - 2) % rule.list.length];
}

/** @return {?Object} The roster entry for a name, or null. */
function namedMember_(name) {
  const wanted = squashKey_(name);
  if (!wanted) return null;
  return loadTeam_().filter(function (member) {
    return squashKey_(member.name) === wanted;
  })[0] || null;
}

/**
 * Records that a lead was handed to someone, in the sheet and in the cache, so
 * a batch import spreads evenly instead of giving every row to one person.
 * @param {!Object} member
 */
function recordAssignment_(member) {
  member.count += 1;
  member.lastAt = nowStamp_();
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.team);
  if (!sheet || !member.row) return;
  updateRowCells_(sheet, member.row, {
    'Assigned Count': member.count,
    'Last Assigned At': member.lastAt
  });
}

/**
 * Emails the new lead to whoever should act on it: the assignee, plus any
 * watchers configured for the destination tab or the event type.
 * Failures are logged, never thrown — a mail quota must not lose a lead.
 * @param {!Object} lead
 * @param {string} tabName
 * @param {?Object=} assignment The roster entry the lead went to, if any.
 */
function notifyTeam_(lead, tabName, assignment) {
  if (!settingIsOn_('Notify On New Lead')) return;

  const recipients = [];
  if (assignment && assignment.email) recipients.push(assignment.email);
  [tabName, lead.eventTypeTab].forEach(function (key) {
    if (!key) return;
    String(setting_('Notify - ' + key, '')).split(/[,;]/).forEach(function (address) {
      const trimmed = address.trim();
      if (trimmed && recipients.indexOf(trimmed) === -1) recipients.push(trimmed);
    });
  });
  if (!recipients.length) return;

  const lines = [
    'Event type: ' + lead.eventTypeLabel,
    lead.presenter ? 'Presenter: ' + lead.presenter : '',
    'Name: ' + (lead.fullName || '(not given)'),
    'Email: ' + (lead.email || '(not given)'),
    'Phone: ' + (lead.phone || lead.phoneRaw || '(not given)'),
    'Event date: ' + (lead.eventDate || '(not given)'),
    'Guests: ' + (lead.guestCount || '(not given)'),
    'Source: ' + lead.source + ' / ' + lead.subSource,
    lead.assignedTo ? 'Assigned to: ' + lead.assignedTo : '',
    '',
    lead.message || '',
    '',
    getSpreadsheet_().getUrl()
  ].filter(function (line) { return line !== undefined; });

  try {
    MailApp.sendEmail({
      to: recipients.join(','),
      subject: '[New ' + lead.eventTypeLabel + ' lead] ' + (lead.fullName || lead.email || lead.phone),
      body: lines.join('\n')
    });
  } catch (err) {
    log_('WARN', 'notify', 'Could not send notification', { tab: tabName, error: String(err) });
  }
}

/**
 * Folds a repeat inquiry into the lead we already have.
 *
 * The original row stays where the sales team can see it and gains: a touch
 * count, the latest contact time, the new sub-source, any contact detail or
 * event detail that was previously blank, and — when enabled — a dated note
 * carrying whatever the person said this time. The incoming record itself is
 * filed in the Duplicates tab so nothing is thrown away.
 *
 * @param {!Object} incoming
 * @param {!{matchedOn: string, entry: !Object}} match
 * @return {{action: string, tab: string, row: number, leadId: string}}
 */
function mergeDuplicate_(incoming, match) {
  const entry = match.entry;
  const sheet = getSpreadsheet_().getSheetByName(entry.tab);

  if (!sheet) {
    log_('WARN', 'dedupe', 'Indexed tab is missing; treating lead as new', entry);
    INDEX_CACHE_ = null;
    return Object.assign({ action: 'created' }, routeLead_(incoming), { leadId: incoming.leadId });
  }

  const row = findLeadRow_(sheet, entry.leadId, entry.row);
  if (!row) {
    log_('WARN', 'dedupe', 'Indexed row no longer holds this lead; treating as new', entry);
    return Object.assign({ action: 'created' }, routeLead_(incoming), { leadId: incoming.leadId });
  }
  if (row !== entry.row) moveIndexEntries_(entry.leadId, entry.tab, row);

  const original = readLeadRow_(sheet, row);
  const updates = buildMergeUpdates_(original, incoming, match.matchedOn);

  updateRowCells_(sheet, row, updates);
  mergeIndexKeys_(incoming, { leadId: entry.leadId, tab: entry.tab, row: row });
  syncAllLeadsRow_(entry.leadId, updates);
  recordDuplicate_(incoming, match, entry.leadId, entry.tab);

  const promoted = maybePromote_(sheet, row, original, incoming, entry.leadId);
  return {
    action: promoted ? 'merged+promoted' : 'merged',
    tab: promoted ? promoted.tab : entry.tab,
    row: promoted ? promoted.row : row,
    leadId: entry.leadId
  };
}

/**
 * Works out which cells a repeat inquiry should change on the original row.
 * Existing values are never overwritten — only blanks are filled.
 * @param {!Object} original As read from the sheet.
 * @param {!Object} incoming
 * @param {string} matchedOn
 * @return {!Object<string,*>} Keyed by column header.
 */
function buildMergeUpdates_(original, incoming, matchedOn) {
  const updates = {
    'Touches': (Number(original.touches) || 1) + 1,
    'Last Touch At': incoming.receivedAt
  };

  const subSources = String(original.allSubSources || original.subSource || '')
    .split(/\s*\|\s*/)
    .map(function (s) { return s.trim(); })
    .filter(String);
  if (incoming.subSource && subSources.indexOf(incoming.subSource) === -1) {
    subSources.push(incoming.subSource);
    updates['All Sub-Sources'] = subSources.join(' | ');
  }

  // Fill blanks only.
  const fillable = {
    'Email': incoming.email,
    'Phone': incoming.phone,
    'Phone (Raw)': incoming.phoneRaw,
    'Full Name': incoming.fullName,
    'First Name': incoming.firstName,
    'Last Name': incoming.lastName,
    'Company': incoming.company,
    'Event Date': incoming.eventDate,
    'Guest Count': incoming.guestCount,
    'Venue / Location': incoming.venue,
    'Budget': incoming.budget,
    'Campaign': incoming.campaign
  };
  Object.keys(fillable).forEach(function (header) {
    const field = COLUMN_TO_FIELD[header];
    if (!cleanText_(original[field]) && cleanText_(fillable[header])) {
      updates[header] = fillable[header];
    }
  });

  if (settingIsOn_('Append Duplicate Notes') && cleanText_(incoming.message)) {
    const note = '--- ' + incoming.receivedAt + ' via ' + incoming.source +
      ' / ' + incoming.subSource + ' (' + matchedOn + ' match) ---\n' + incoming.message;
    const existing = cleanText_(original.message);
    if (existing.indexOf(cleanText_(incoming.message)) === -1) {
      updates['Message'] = (original.message ? original.message + '\n\n' : '') + note;
    }
  }

  return updates;
}

/** Applies the same updates to the lead's row in All Leads, when present. */
function syncAllLeadsRow_(leadId, updates) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.allLeads);
  if (!sheet) return;
  const row = findLeadRow_(sheet, leadId, 0);
  if (row) updateRowCells_(sheet, row, updates);
}

/** Files the incoming duplicate in the Duplicates tab. */
function recordDuplicate_(incoming, match, originalLeadId, originalTab) {
  const sheet = getOrCreateSheet_(SHEETS.duplicates, LEAD_COLUMNS.concat(DUPLICATE_EXTRA_COLUMNS));
  const record = Object.assign({}, incoming, {
    status: 'Duplicate',
    matchedOn: match.matchedOn,
    originalLeadId: originalLeadId,
    originalTab: originalTab
  });
  appendLead_(sheet, record);
}

/**
 * Moves a lead out of Unassigned once a later submission tells us what kind of
 * event it is. Without this, a lead whose first form had no event-type question
 * would sit in Unassigned forever.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet holding the lead.
 * @param {number} row
 * @param {!Object} original
 * @param {!Object} incoming
 * @param {string} leadId
 * @return {?{tab: string, row: number}} The new location, or null if unmoved.
 */
function maybePromote_(sheet, row, original, incoming, leadId) {
  if (!settingIsOn_('Promote Unassigned Leads')) return null;
  if (sheet.getName() !== FALLBACK_EVENT_TYPE.tab) return null;
  if (!incoming.eventTypeKey || incoming.eventTypeKey === FALLBACK_EVENT_TYPE.key) return null;

  const moved = readLeadRow_(sheet, row);
  moved.eventTypeLabel = incoming.eventTypeLabel;
  moved.eventTypeTab = incoming.eventTypeTab;
  moved.eventTypeRaw = incoming.eventTypeRaw || moved.eventTypeRaw;
  moved.leadId = leadId;

  // Now that we know the event type, the lead can be given to a person.
  const assignment = pickAssignee_(moved);
  const targetTab = (assignment && assignment.tab) || incoming.eventTypeTab;
  if (assignment && !cleanText_(moved.assignedTo)) moved.assignedTo = assignment.name;

  const targetSheet = getOrCreateSheet_(targetTab, LEAD_COLUMNS);
  if (assignment) {
    moved.presenter = presenterFor_(
      incoming.eventTypeLabel, targetSheet.getLastRow() + 1, assignment.name);
  }
  const newRow = appendLead_(targetSheet, moved);
  sheet.deleteRow(row);
  shiftIndexRowsAfterDelete_(sheet.getName(), row);
  moveIndexEntries_(leadId, targetTab, newRow);
  syncAllLeadsRow_(leadId, {
    'Event Type': incoming.eventTypeLabel,
    'Event Type (Raw)': incoming.eventTypeRaw || '',
    'Assigned To': moved.assignedTo,
    'Presenter': moved.presenter || ''
  });
  if (assignment) recordAssignment_(assignment);
  notifyTeam_(moved, targetTab, assignment);

  log_('INFO', 'router', 'Promoted lead out of ' + FALLBACK_EVENT_TYPE.tab, {
    leadId: leadId, to: targetTab, assignedTo: moved.assignedTo
  });
  return { tab: targetTab, row: newRow };
}

/** Keeps index row numbers correct after a row is deleted from a tab. */
function shiftIndexRowsAfterDelete_(tabName, deletedRow) {
  const index = loadIndex_();
  Object.keys(index.byKey).forEach(function (key) {
    const entry = index.byKey[key];
    if (entry.tab !== tabName || entry.row <= deletedRow) return;
    entry.row -= 1;
    index.sheet.getRange(entry.indexRow, 4).setValue(entry.row);
  });
}

// ==========================================================================
// src/07_Intake.gs
// ==========================================================================

/**
 * The intake pipeline. Every lead — webhook or worksheet — goes through here,
 * so website, Google Ads and exhibit leads are normalised, deduped, tagged and
 * routed by exactly the same rules.
 */

const RAW_COLUMNS = ['Ref', 'Received At', 'Source', 'Sub-Source', 'Payload'];

/**
 * Archives the payload exactly as received and returns a reference for the
 * lead row. When a form changes shape, this is the record that explains what
 * actually arrived.
 * @param {string} source
 * @param {string} subSource
 * @param {*} payload
 * @return {string} Raw reference, e.g. "RAW-000123".
 */
function storeRaw_(source, subSource, payload) {
  const sheet = getOrCreateSheet_(SHEETS.raw, RAW_COLUMNS);
  const ref = 'RAW-' + Utilities.formatString('%06d', sheet.getLastRow());
  let serialised;
  try {
    serialised = typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch (err) {
    serialised = String(payload);
  }
  sheet.appendRow([ref, nowStamp_(), source, subSource, serialised.slice(0, 45000)]);
  return ref;
}

/**
 * Runs one record end to end.
 *
 * @param {!Object} input
 * @param {!Object<string,*>} input.flat Flattened key/value pairs.
 * @param {string} input.source One of SOURCES.
 * @param {string} input.subSource Form or fair name.
 * @param {string=} input.receivedAt
 * @param {string=} input.defaultEventType
 * @param {string=} input.rawRef
 * @return {{action: string, leadId: string, tab: string, row: number,
 *           eventType: string, reason: (string|undefined)}}
 */
function intakeRecord_(input) {
  const mapped = mapRecord_(input.flat);
  const lead = buildLead_({
    fields: mapped.fields,
    extras: mapped.extras,
    messages: mapped.messages,
    source: input.source,
    subSource: input.subSource,
    receivedAt: input.receivedAt,
    defaultEventType: input.defaultEventType,
    rawRef: input.rawRef
  });

  if (!lead.email && !lead.phone && !lead.fullName) {
    return { action: 'skipped', reason: 'no contact details', leadId: '', tab: '', row: 0, eventType: '' };
  }
  if (!lead.email && !lead.phone) {
    lead.status = 'Needs Contact Info';
  }

  const duplicate = findDuplicate_(lead);
  if (duplicate) {
    const merged = mergeDuplicate_(lead, duplicate);
    return {
      action: merged.action,
      leadId: merged.leadId,
      tab: merged.tab,
      row: merged.row,
      eventType: lead.eventTypeLabel,
      reason: 'matched on ' + duplicate.matchedOn
    };
  }

  const placed = routeLead_(lead);
  return {
    action: 'created',
    leadId: lead.leadId,
    tab: placed.tab,
    row: placed.row,
    eventType: lead.eventTypeLabel
  };
}

/**
 * Runs a batch of records under a single lock, so an import cannot interleave
 * with an inbound webhook.
 * @param {!Array<!Object>} records Each shaped like intakeRecord_'s argument.
 * @param {string} context Label for the log.
 * @return {{total: number, created: number, merged: number, skipped: number,
 *           byTab: !Object<string,number>, results: !Array<!Object>}}
 */
function intakeBatch_(records, context) {
  return withLock_(function () {
    const summary = { total: records.length, created: 0, merged: 0, skipped: 0, byTab: {}, results: [] };

    records.forEach(function (record) {
      let result;
      try {
        result = intakeRecord_(record);
      } catch (err) {
        result = { action: 'error', reason: String(err && err.message || err), leadId: '', tab: '', row: 0 };
        log_('ERROR', context, 'Record failed', { error: String(err), record: record.subSource });
      }

      if (result.action === 'created') summary.created++;
      else if (result.action === 'skipped' || result.action === 'error') summary.skipped++;
      else summary.merged++;

      if (result.tab) summary.byTab[result.tab] = (summary.byTab[result.tab] || 0) + 1;
      summary.results.push(result);
    });

    log_('INFO', context, 'Batch complete', {
      total: summary.total, created: summary.created,
      merged: summary.merged, skipped: summary.skipped, byTab: summary.byTab
    });

    housekeeping_();
    return summary;
  }, 120000);
}

/** Keeps the archive tabs from growing without bound. */
function housekeeping_() {
  try {
    trimSheet_(SHEETS.raw, Number(setting_('Raw Payload Retention (rows)', '2000')) || 2000);
    trimSheet_(SHEETS.log, Number(setting_('Log Retention (rows)', '5000')) || 5000);
  } catch (err) {
    console.error('Housekeeping failed: ' + err);
  }
}

// ==========================================================================
// src/08_WebApp.gs
// ==========================================================================

/**
 * The webhook endpoint. One deployed URL serves every on-page Wix form and
 * every Google Ads lead form; the query string says which is which.
 *
 *   .../exec?token=SECRET&source=website&form=Homepage%20Inquiry
 *   .../exec?source=googleads            (Google Ads sends its own google_key)
 *
 * Adding a new website form is a matter of pointing it at this URL with a new
 * &form= value — no code change, no redeploy.
 */

/**
 * Handles an inbound lead submission.
 * @param {!GoogleAppsScript.Events.DoPost} e
 * @return {!GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const params = (e && e.parameter) || {};
    const isGoogleAds = looksLikeGoogleAds_(payload);

    const auth = authorize_(params, payload, isGoogleAds);
    if (!auth.ok) {
      log_('WARN', 'webhook', 'Rejected unauthorised request', { reason: auth.reason });
      return jsonResponse_({ status: 'error', message: auth.reason });
    }

    if (isGoogleAds && payload.is_test && !settingIsOn_('Accept Test Leads')) {
      log_('INFO', 'webhook', 'Google Ads test lead acknowledged and not stored', {
        formId: payload.form_id
      });
      return jsonResponse_({ status: 'ok', message: 'test lead acknowledged' });
    }

    const source = resolveSource_(params, isGoogleAds);
    const subSource = resolveWebhookSubSource_(params, payload, isGoogleAds);
    const flat = isGoogleAds ? flattenGoogleAds_(payload) : flatten_(payload);
    if (!Object.keys(flat).length) {
      return jsonResponse_({ status: 'error', message: 'empty payload' });
    }

    const rawRef = storeRaw_(source, subSource, payload);
    const summary = intakeBatch_([{
      flat: flat,
      source: source,
      subSource: subSource,
      rawRef: rawRef
    }], 'webhook');

    const result = summary.results[0];
    return jsonResponse_({
      status: 'ok',
      action: result.action,
      leadId: result.leadId,
      eventType: result.eventType,
      tab: result.tab
    });
  } catch (err) {
    log_('ERROR', 'webhook', 'Unhandled failure', { error: String(err && err.stack || err) });
    // 200 with an error body: form tools retry aggressively on non-200, and a
    // retry storm would be worse than one logged failure we can replay from _Raw.
    return jsonResponse_({ status: 'error', message: String(err && err.message || err) });
  }
}

/**
 * Health check. Visiting the deployed URL in a browser confirms the deployment
 * is live without creating anything.
 * @param {!GoogleAppsScript.Events.DoGet} e
 * @return {!GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  return jsonResponse_({
    status: 'ok',
    service: 'Website Leads Automation',
    time: nowStamp_(),
    tabs: leadTabNames_()
  });
}

/** @return {!GoogleAppsScript.Content.TextOutput} */
function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Reads the request body as JSON, falling back to form-encoded parameters.
 * @param {!GoogleAppsScript.Events.DoPost} e
 * @return {!Object}
 */
function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    const contents = e.postData.contents;
    try {
      const parsed = JSON.parse(contents);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (err) {
      // Not JSON — fall through to the parsed form parameters below.
    }
  }
  const params = Object.assign({}, (e && e.parameter) || {});
  delete params.token;
  delete params.source;
  delete params.form;
  return params;
}

/** @return {boolean} True when the payload is a Google Ads lead form webhook. */
function looksLikeGoogleAds_(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return GOOGLE_ADS_MARKERS.some(function (marker) {
    return Object.prototype.hasOwnProperty.call(payload, marker);
  });
}

/**
 * Verifies the caller.
 *
 * Google Ads authenticates with the `google_key` you set on the lead form;
 * everything else uses a shared token on the query string. When the matching
 * script property is not set the request is allowed and a warning is logged,
 * so a new form can be tested before the secret is in place.
 *
 * @return {{ok: boolean, reason: string}}
 */
function authorize_(params, payload, isGoogleAds) {
  const props = PropertiesService.getScriptProperties();

  if (isGoogleAds) {
    const expected = props.getProperty('GOOGLE_ADS_KEY');
    if (!expected) {
      log_('WARN', 'webhook', 'GOOGLE_ADS_KEY is not set — accepting unverified Google Ads lead');
      return { ok: true, reason: '' };
    }
    return payload.google_key === expected
      ? { ok: true, reason: '' }
      : { ok: false, reason: 'invalid google_key' };
  }

  const expected = props.getProperty('WEBHOOK_TOKEN');
  if (!expected) {
    log_('WARN', 'webhook', 'WEBHOOK_TOKEN is not set — accepting unverified request');
    return { ok: true, reason: '' };
  }
  const supplied = params.token || params.key || (payload && payload.token) || '';
  return supplied === expected
    ? { ok: true, reason: '' }
    : { ok: false, reason: 'invalid token' };
}

/** @return {string} One of SOURCES. */
function resolveSource_(params, isGoogleAds) {
  const requested = squashKey_(params.source || '');
  if (requested === 'googleads' || requested === 'ads') return SOURCES.googleAds;
  if (requested === 'exhibit' || requested === 'fair' || requested === 'bridalfair') return SOURCES.exhibit;
  if (requested === 'website' || requested === 'wix' || requested === 'web') return SOURCES.website;
  return isGoogleAds ? SOURCES.googleAds : SOURCES.website;
}

/**
 * Works out the sub-source: the explicit &form= parameter wins, then any
 * form-name field in the payload, then a per-source default.
 * @return {string}
 */
function resolveWebhookSubSource_(params, payload, isGoogleAds) {
  const explicit = cleanText_(params.form || params.subsource || params.sub_source);
  if (explicit) return explicit;

  if (isGoogleAds) {
    const formId = payload.form_id || payload.formId;
    return formId ? 'Google Ads Form ' + formId : 'Google Ads Lead Form';
  }

  const flat = flatten_(payload);
  const found = Object.keys(flat).filter(function (path) {
    return matchField_(leafKey_(path)).field === 'subSource' && cleanText_(flat[path]);
  })[0];
  if (found) {
    const value = cleanText_(flat[found]);
    // A bare id makes a poor label on a sales tab; say what it is.
    return /^\d+$/.test(value) ? 'Form ' + value : value;
  }
  return 'Website Form';
}

/**
 * Converts a Google Ads lead-form payload into flat key/value pairs.
 * Custom questions arrive with the question text as the column id, so they map
 * through the same alias dictionary as any other form.
 * @param {!Object} payload
 * @return {!Object<string,*>}
 */
function flattenGoogleAds_(payload) {
  const flat = {};
  (payload.user_column_data || []).forEach(function (column) {
    const label = column.column_name || column.column_id || '';
    const value = column.string_value !== undefined ? column.string_value : column.value;
    if (label && value !== undefined && value !== null && value !== '') flat[label] = value;
  });
  if (payload.campaign_id) flat['campaign_id'] = payload.campaign_id;
  if (payload.gcl_id) flat['gclid'] = payload.gcl_id;
  return flat;
}

/**
 * Convenience for the menu: the current web-app URL, or '' when the script has
 * never been deployed.
 * @return {string}
 */
function getWebhookUrl() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

// ==========================================================================
// src/09_FairImport.gs
// ==========================================================================

/**
 * Bridal-fair (exhibit) worksheet import.
 *
 * Fair organisers send a spreadsheet in whatever layout they like: a title row
 * or two before the real headers, a "Contact No." column here, a "Mobile"
 * column there. The importer finds the header row, maps the columns through the
 * same alias dictionary the webhooks use, and pushes each row through the same
 * intake pipeline — so exhibit leads are deduped against website and Google Ads
 * leads, not just against each other.
 */

/**
 * Imports every row of a worksheet as Exhibit leads.
 *
 * @param {!Object} options
 * @param {string=} options.spreadsheetId Source spreadsheet; defaults to this one.
 * @param {string=} options.spreadsheetUrl Alternative to spreadsheetId.
 * @param {string=} options.sheetName Tab within the source; defaults to the first.
 * @param {string} options.fairName Sub-source, e.g. "Wedding Expo Manila 2026".
 * @param {string=} options.fairDate Used as the received date for every row.
 * @param {string=} options.defaultEventType Defaults to "Wedding".
 * @param {number=} options.headerRow 1-based; auto-detected when omitted.
 * @return {!Object} The intakeBatch_ summary, plus `headerRow` and `mapped`.
 */
function importFairWorksheet(options) {
  const opts = options || {};
  if (!cleanText_(opts.fairName)) throw new Error('A fair name is required — it becomes the sub-source.');

  const sheet = resolveSourceSheet_(opts);
  const table = readTable_(sheet, opts.headerRow);
  if (!table.rows.length) {
    throw new Error('No data rows found in "' + sheet.getName() + '" below header row ' + table.headerRow + '.');
  }

  const receivedAt = opts.fairDate
    ? normalizeDate_(opts.fairDate) + ' 00:00:00'
    : nowStamp_();
  const defaultEventType = cleanText_(opts.defaultEventType) || 'Wedding';

  const records = table.rows.map(function (row) {
    const flat = {};
    table.headers.forEach(function (header, i) {
      const value = row[i];
      if (!header || value === '' || value === null || value === undefined) return;
      // Organiser sheets sometimes repeat a header ("Contact No." twice for two
      // numbers); keep both rather than letting the second overwrite the first.
      const key = flat[header] === undefined ? header : header + ' (' + (i + 1) + ')';
      flat[key] = value;
    });
    return {
      flat: flat,
      source: SOURCES.exhibit,
      subSource: cleanText_(opts.fairName),
      receivedAt: receivedAt,
      defaultEventType: defaultEventType
    };
  }).filter(function (record) {
    return Object.keys(record.flat).length > 0;
  });

  const rawRef = storeRaw_(SOURCES.exhibit, cleanText_(opts.fairName), {
    sheet: sheet.getName(),
    headerRow: table.headerRow,
    headers: table.headers,
    rowCount: records.length
  });
  records.forEach(function (record) { record.rawRef = rawRef; });

  const summary = intakeBatch_(records, 'fair-import');
  summary.headerRow = table.headerRow;
  summary.mapped = describeMapping_(table.headers);
  summary.fairName = cleanText_(opts.fairName);
  log_('INFO', 'fair-import', 'Imported "' + summary.fairName + '"', {
    headerRow: table.headerRow, mapped: summary.mapped, created: summary.created,
    merged: summary.merged, skipped: summary.skipped
  });
  return summary;
}

/**
 * Resolves the sheet to read from: another spreadsheet by id/URL, or a tab in
 * this one (which is what you get after pasting the organiser's file in).
 * @param {!Object} opts
 * @return {!GoogleAppsScript.Spreadsheet.Sheet}
 */
function resolveSourceSheet_(opts) {
  let book = getSpreadsheet_();
  const id = cleanText_(opts.spreadsheetId) || extractSpreadsheetId_(opts.spreadsheetUrl);
  if (id && id !== book.getId()) {
    try {
      book = SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error('Could not open spreadsheet "' + id + '". Check the link and that you have access.');
    }
  }

  const name = cleanText_(opts.sheetName);
  if (!name) return book.getSheets()[0];

  const sheet = book.getSheetByName(name);
  if (!sheet) {
    throw new Error('No tab named "' + name + '" in ' + book.getName() + '.');
  }
  return sheet;
}

/** @return {string} The spreadsheet id inside a Google Sheets URL, or ''. */
function extractSpreadsheetId_(url) {
  const text = cleanText_(url);
  if (!text) return '';
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(text) ? text : '';
}

/**
 * Reads a sheet into headers plus data rows, skipping any title rows above the
 * real header.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number=} headerRow 1-based; auto-detected when omitted.
 * @return {{headerRow: number, headers: !Array<string>, rows: !Array<!Array<*>>}}
 */
function readTable_(sheet, headerRow) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { headerRow: 1, headers: [], rows: [] };

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const index = (headerRow && headerRow > 0) ? headerRow - 1 : detectHeaderRow_(values);
  const headers = values[index].map(function (h) { return cleanText_(h); });

  const rows = values.slice(index + 1).filter(function (row) {
    return row.some(function (cell) { return cleanText_(cell) !== ''; });
  });
  return { headerRow: index + 1, headers: headers, rows: rows };
}

/**
 * Finds the header row: within the first 15 rows, the one whose cells map to
 * the most known fields, requiring at least two. Falls back to row 1.
 * @param {!Array<!Array<*>>} values
 * @return {number} 0-based index.
 */
function detectHeaderRow_(values) {
  let bestIndex = 0;
  let bestScore = 0;
  const limit = Math.min(values.length, 15);

  for (let i = 0; i < limit; i++) {
    let score = 0;
    values[i].forEach(function (cell) {
      const text = cleanText_(cell);
      if (!text || text.length > 80) return;
      if (matchField_(text).field) score++;
    });
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 2 ? bestIndex : 0;
}

/**
 * Explains how each column was interpreted, for the import confirmation.
 * @param {!Array<string>} headers
 * @return {!Object<string,string>} Header -> canonical field or "(notes)".
 */
function describeMapping_(headers) {
  const mapping = {};
  headers.forEach(function (header) {
    if (!header) return;
    if (isNoiseKey_(header)) {
      mapping[header] = '(ignored)';
      return;
    }
    const match = matchField_(header);
    mapping[header] = match.field ? humanizeKey_(match.field) : '(notes)';
  });
  return mapping;
}

// ==========================================================================
// src/10_Setup.gs
// ==========================================================================

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
    'Accept Test Leads': 'yes = store Google Ads test leads instead of only acknowledging them.',
    'Round Robin Assignment': 'yes = share leads across the _Team roster.',
    'Presenters': 'The default repeating sequence down the Presenter column, in order. Overridden per event type below.',
    'Notify On New Lead': 'yes = email the addresses in the Notify rows below.',
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
    'Phone (Raw)': 130, 'Company': 170, 'Event Date': 110, 'Event Date (Raw)': 120, 'Guest Count': 100,
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

// ==========================================================================
// src/11_Menu.gs
// ==========================================================================

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

// ==========================================================================
// src/12_Tests.gs
// ==========================================================================

/**
 * Self-test. Runs the pure logic — normalisation, field mapping, event-type
 * routing, payload parsing — against known inputs, then checks the _Team
 * roster for the mistakes that would quietly stop leads reaching people.
 * It never writes anything, so it is safe to run on the live workbook
 * (Leads > Run self-test).
 */

/**
 * @return {{summary: string, detail: string, failures: number,
 *           roster: !Array<string>}}
 */
function runSelfTest() {
  const results = [];

  function check(name, actual, expected) {
    const pass = String(actual) === String(expected);
    results.push({
      pass: pass,
      line: (pass ? 'PASS  ' : 'FAIL  ') + name +
        (pass ? '' : '\n        expected: ' + expected + '\n        actual:   ' + actual)
    });
  }

  // --- Phone normalisation -------------------------------------------------
  check('phone: 0917 format', normalizePhone_('0917 123 4567', '63'), '+639171234567');
  check('phone: punctuated', normalizePhone_('(0917) 123-4567', '63'), '+639171234567');
  check('phone: already +63', normalizePhone_('+63 917 123 4567', '63'), '+639171234567');
  check('phone: bare 63 prefix', normalizePhone_('639171234567', '63'), '+639171234567');
  check('phone: no leading zero', normalizePhone_('9171234567', '63'), '+639171234567');
  check('phone: two numbers keeps first', normalizePhone_('0917 123 4567 / 0918 765 4321', '63'), '+639171234567');
  check('phone: foreign number kept', normalizePhone_('+1 415 555 0132', '63'), '+14155550132');
  check('phone: junk rejected', normalizePhone_('n/a', '63'), '');

  // --- Email normalisation -------------------------------------------------
  check('email: trimmed and lowered', normalizeEmail_('  Maria.Cruz@Gmail.COM '), 'maria.cruz@gmail.com');
  check('email: invalid rejected', normalizeEmail_('not an email'), '');
  check('email: plus tag stripped for matching',
    emailDedupeKey_('maria+expo@gmail.com') === emailDedupeKey_('maria@gmail.com'), 'true');

  // --- Names ---------------------------------------------------------------
  check('name: split', splitName_('Maria Clara Cruz').lastName, 'Clara Cruz');
  check('name: all caps tidied', tidyName_('MARIA CRUZ'), 'Maria Cruz');

  // --- Dates and guest counts ---------------------------------------------
  check('date: ISO', normalizeDate_('2026-12-14'), '2026-12-14');
  check('date: US slash', normalizeDate_('12/14/2026'), '2026-12-14');
  check('date: day-first when unambiguous', normalizeDate_('14/12/2026'), '2026-12-14');
  check('date: unparseable kept', normalizeDate_('sometime next year'), 'sometime next year');
  check('date: month-first is certain when the day is over 12',
    classifyDate_('03/15/2027').status + ' ' + classifyDate_('03/15/2027').value, 'iso 2027-03-15');
  check('date: day-first is certain when the day is over 12',
    classifyDate_('15/03/2027').status + ' ' + classifyDate_('15/03/2027').value, 'iso 2027-03-15');
  check('date: both under 12 is ambiguous', classifyDate_('03/04/2027').status, 'ambiguous');
  check('date: same day and month reads the same either way',
    classifyDate_('06/06/2027').status + ' ' + classifyDate_('06/06/2027').value, 'iso 2027-06-06');
  check('date: ambiguous yields no value', classifyDate_('03/04/2027').value, '');
  check('date: ISO is certain', classifyDate_('2027-03-15').status, 'iso');
  check('date: a month name settles it', classifyDate_('March 15, 2027').status, 'iso');
  check('date: prose is unreadable', classifyDate_('sometime next year').status, 'unreadable');
  check('date: original always preserved', classifyDate_('03/04/2027').original, '03/04/2027');

  check('guests: prose', normalizeGuestCount_('around 150 pax'), '150');
  check('guests: range', normalizeGuestCount_('100 - 150'), '100-150');

  // --- Event type routing --------------------------------------------------
  check('route: exact label', resolveEventType_('Corporate').tab, 'Corporate');
  check('route: corporate wording', resolveEventType_('Company Christmas Party').tab, 'Corporate');
  check('route: wedding wording', resolveEventType_('Church Wedding Reception').tab, 'Wedding');
  check('route: debut', resolveEventType_('Debut / 18th Birthday').tab, 'Debut');
  check('route: 18th beats plain birthday', resolveEventType_('18th Birthday Party').tab, 'Debut');
  check('route: kiddie party', resolveEventType_('Kiddie Party').tab, "Kid's Party");
  check('route: christening', resolveEventType_('Christening / Baptism').tab, "Kid's Party");
  check('route: 1st birthday is a kids party', resolveEventType_('1st Birthday').tab, "Kid's Party");
  check('route: plain birthday is private', resolveEventType_('Birthday celebration').tab, 'Private Event');
  check('route: corporate anniversary stays corporate',
    resolveEventType_('Corporate Anniversary').tab, 'Corporate');
  check('route: wedding anniversary is private',
    resolveEventType_('Wedding Anniversary').tab, 'Private Event');
  check('route: private wording', resolveEventType_('Intimate family gathering').tab, 'Private Event');
  check('route: blank falls back', resolveEventType_('').tab, FALLBACK_EVENT_TYPE.tab);
  check('route: unknown falls back', resolveEventType_('Bar mitzvah').tab, FALLBACK_EVENT_TYPE.tab);
  check('route: context used when field is blank',
    resolveEventType_('', ['Looking for a venue for our wedding reception']).tab, 'Wedding');

  // --- Field mapping -------------------------------------------------------
  check('map: contact no -> phone', matchField_('Contact No.').field, 'phone');
  check('map: Google Ads column id', matchField_('PHONE_NUMBER').field, 'phone');
  check('map: question-style header', matchField_('What type of event are you planning?').field, 'eventType');
  check('map: noise ignored', isNoiseKey_('g-recaptcha-response'), 'true');
  check('map: unknown "... Date" header', matchField_('Wedding Date').field, 'eventDate');
  check('map: alias still beats the suffix rule', matchField_('Date Received').field, 'receivedAt');

  const mapped = mapRecord_({
    'Full Name': 'Ana Reyes',
    'Email Address': 'ana@example.com',
    'Mobile Number': '09171234567',
    'Type of Event': 'Corporate Seminar',
    'How did you hear about us': 'Instagram'
  });
  check('map: name captured', mapped.fields.fullName, 'Ana Reyes');
  check('map: unknown answer kept as extra', mapped.extras.length, 1);
  check('map: extra label humanised', mapped.extras[0].label, 'How Did You Hear About Us');
  check('map: shouted header stops shouting', humanizeKey_('SALES NOTES'), 'Sales Notes');
  check('map: deliberate mixed case left alone', humanizeKey_('Preferred VIP Room'), 'Preferred VIP Room');

  // --- Columns competing for one destination -------------------------------
  const notesRecord = mapRecord_({
    'Full name': 'Rosa Lim',
    'Contact number': '0917 123 4567',
    'CONTACT METHOD': 'Viber please',
    'SALES NOTES': 'Called twice, no answer',
    'CLIENT NOTES': 'Wants a garden setup',
    'CONSO DATE': '2026-01-04',
    'PRESENTER': 'Pam',
    'BOOTH STAFF': 'Iris'
  });
  check('notes: contact method is free text, not a phone', matchField_('CONTACT METHOD').field, 'message');
  check('notes: phone column still wins the phone slot', notesRecord.fields.phone, '0917 123 4567');
  check('notes: every notes column kept', notesRecord.messages.length, 3);
  check('notes: sales notes survived',
    notesRecord.messages.some(function (m) { return m.value === 'Called twice, no answer'; }), 'true');
  check('notes: client notes survived',
    notesRecord.messages.some(function (m) { return m.value === 'Wants a garden setup'; }), 'true');
  check('notes: labelled by their own headers', notesRecord.messages[0].label.length > 0, 'true');
  check('conso date is dropped, not filed as an event date', isNoiseKey_('CONSO DATE'), 'true');
  check('presenter gets its own column, not the notes', notesRecord.fields.presenter, 'Pam');
  check('unknown column still reaches the notes',
    notesRecord.extras.some(function (e) { return e.value === 'Iris'; }), 'true');

  // --- The presenter sequence ----------------------------------------------
  check('presenter: first row', presenterFor_('Wedding', 2, 'Bea'), 'AJ');
  check('presenter: second row', presenterFor_('Wedding', 3, 'Bea'), 'Pam');
  check('presenter: third row', presenterFor_('Debut', 4, 'Bea'), 'Mhay');
  check('presenter: fourth row', presenterFor_("Kid's Party", 5, 'Bea'), 'Vanessa');
  check('presenter: sequence repeats', presenterFor_('Private Event', 6, 'Bea'), 'AJ');
  check('presenter: still repeating far down', presenterFor_('Wedding', 42, 'Bea'), 'AJ');
  check('presenter: and off the cycle boundary', presenterFor_('Wedding', 45, 'Bea'), 'Vanessa');
  check('presenter: header row has none', presenterFor_('Wedding', 1, 'Bea'), '');

  const twoPhones = mapRecord_({
    'Contact No.': '0917 111 1111',
    'Contact No. (2)': '0918 222 2222'
  });
  check('two phone columns: first wins the column', twoPhones.fields.phone, '0917 111 1111');
  check('two phone columns: second is not lost', twoPhones.extras.length, 1);

  check('a single notes column reads as plain text',
    composeMessage_([{ label: 'Message', value: 'Just the one' }], []), 'Just the one');
  check('several notes columns get labelled',
    composeMessage_([
      { label: 'Sales Notes', value: 'Called twice' },
      { label: 'Client Notes', value: 'Garden setup' }
    ], []),
    'Sales Notes: Called twice\nClient Notes: Garden setup');
  check('unmatched columns follow the notes',
    composeMessage_([{ label: 'Message', value: 'Hello' }], [{ label: 'Presenter', value: 'Iris' }]),
    'Hello\nPresenter: Iris');

  // --- Payload parsing -----------------------------------------------------
  const wix = flatten_({
    formName: 'Homepage Inquiry',
    data: { contact: { name: 'Jose Rizal', email: 'jose@example.com' }, eventType: 'Wedding' },
    tags: ['website', 'inquiry']
  });
  check('flatten: nested value', wix['data.contact.email'], 'jose@example.com');
  check('flatten: scalar array joined', wix['tags'], 'website, inquiry');
  check('flatten: leaf key', leafKey_('data.contact.email'), 'email');
  check('flatten: header with trailing dot', leafKey_('Contact No.'), 'Contact No');
  check('flatten: array index skipped', leafKey_('items.0.name'), 'name');

  const ads = flattenGoogleAds_({
    lead_id: 'abc',
    form_id: 987,
    campaign_id: 555,
    user_column_data: [
      { column_id: 'FULL_NAME', column_name: 'Full Name', string_value: 'Pedro Santos' },
      { column_id: 'PHONE_NUMBER', column_name: 'Phone Number', string_value: '+639181234567' },
      { column_id: 'What is the occasion?', column_name: 'What is the occasion?', string_value: 'Debut' }
    ]
  });
  check('ads: name extracted', ads['Full Name'], 'Pedro Santos');
  check('ads: campaign carried', ads['campaign_id'], 555);
  check('ads: detected as Google Ads', looksLikeGoogleAds_({ user_column_data: [] }), 'true');
  check('ads: plain payload not misdetected', looksLikeGoogleAds_({ email: 'x@y.com' }), 'false');

  const adsMapped = mapRecord_(ads);
  check('ads: routed by custom question',
    resolveEventType_(adsMapped.fields.eventType).tab, 'Debut');

  // --- Header detection ----------------------------------------------------
  const worksheet = [
    ['Wedding Expo Manila 2026 — Exhibitor Leads', '', '', ''],
    ['Booth 14', '', '', ''],
    ['Name', 'Contact No.', 'Email Address', 'Event Date'],
    ['Liza Manalo', '0917 123 4567', 'liza@example.com', '12/14/2026']
  ];
  check('worksheet: header row found', detectHeaderRow_(worksheet), 2);

  // --- Dedupe keys ---------------------------------------------------------
  const keys = dedupeKeys_({
    emailKey: 'ana@example.com', phoneKey: '+639171234567', eventDate: '2026-12-14'
  });
  check('dedupe: email and phone keys built', keys.length >= 2, 'true');

  const failures = results.filter(function (r) { return !r.pass; });
  const roster = rosterReport_();

  let summary = failures.length
    ? failures.length + ' of ' + results.length + ' checks FAILED.'
    : 'All ' + results.length + ' checks passed.';
  const problems = roster.filter(function (line) { return line.indexOf('OK') !== 0; });
  summary += problems.length
    ? '\n' + problems.length + ' thing' + (problems.length === 1 ? '' : 's') +
      ' to fix on the ' + SHEETS.team + ' tab.'
    : '';

  const detail = results.map(function (r) { return r.line; }).join('\n') +
    '\n\n--- ' + SHEETS.team + ' roster ---\n' + roster.join('\n');
  console.log(summary + '\n' + detail);
  return { summary: summary, detail: detail, failures: failures.length, roster: roster };
}

/**
 * Checks the roster for the mistakes that are invisible in the spreadsheet but
 * stop leads reaching people: an event type misspelled so nobody matches it, a
 * salesperson marked active with nothing to cover, two people pointed at one
 * tab, or an event type nobody active handles.
 *
 * Read-only. Lines that do not start with "OK" are things to fix.
 * @return {!Array<string>}
 */
function rosterReport_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.team);
  if (!sheet || sheet.getLastRow() < 2) {
    return ['No roster yet — every lead goes to the shared event-type tabs, unassigned.'];
  }

  const known = {};
  allEventTypes_().forEach(function (type) { known[squashKey_(type.label)] = type.label; });

  const members = loadTeam_();
  const active = members.filter(function (m) { return m.active; });
  const lines = [];

  members.forEach(function (member) {
    const unknown = member.eventTypes.filter(function (label) {
      return label !== '*' && !known[squashKey_(label)];
    });
    if (unknown.length) {
      lines.push('"' + member.name + '" has an event type that matches nothing: ' +
        unknown.join(', ') + '. Leads of that type will never reach them.');
    }
    if (member.active && !member.eventTypes.length) {
      lines.push('"' + member.name + '" is active but covers no event types, so gets nothing.');
    }
  });

  const tabs = {};
  active.forEach(function (member) {
    const key = squashKey_(member.tab);
    if (tabs[key]) {
      lines.push('"' + member.name + '" and "' + tabs[key] + '" both write to the "' +
        member.tab + '" tab — their leads will be mixed together.');
    } else {
      tabs[key] = member.name;
    }
  });

  EVENT_TYPES.forEach(function (type) {
    const covered = active.some(function (member) {
      return member.eventTypes.some(function (label) {
        return label === '*' || squashKey_(label) === squashKey_(type.label);
      });
    });
    if (!covered) {
      lines.push('Nobody active covers ' + type.label + ' — those leads go to the "' +
        type.tab + '" tab, unassigned.');
    }
  });

  if (!lines.length) {
    lines.push('OK — ' + active.length + ' active of ' + members.length + ' on the roster.');
    EVENT_TYPES.forEach(function (type) {
      const names = active.filter(function (member) {
        return member.eventTypes.some(function (label) {
          return label === '*' || squashKey_(label) === squashKey_(type.label);
        });
      }).map(function (member) { return member.name; });

      const rule = presenterRule_(type.label);
      const presenters = rule.mode === 'caller' ? 'presented by the caller'
        : rule.mode === 'none' ? 'no presenter'
        : 'presented by ' + rule.list.join(' → ');
      lines.push('OK — ' + type.label + ': called by ' + names.join(', ') + ', ' + presenters);
    });
  }
  return lines;
}

// ==========================================================================
// src/13_Migrate.gs
// ==========================================================================

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
 *
 * A tab that already has a Presenter column keeps every value in it. The
 * repeating sequence only governs leads that arrive from here on.
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
    'Presenter': lead.presenter,
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

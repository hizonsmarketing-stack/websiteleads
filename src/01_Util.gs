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

/**
 * Reads a numeric setting.
 *
 * Not `Number(setting_(k)) || fallback`: that reads a deliberate 0 as "no
 * value" and quietly substitutes the default, which is exactly wrong for
 * settings where 0 means "none" or "stop immediately".
 *
 * @param {string} key
 * @param {number} fallback Used when the value is blank or not a number.
 * @return {number}
 */
function numberSetting_(key, fallback) {
  const raw = String(setting_(key, String(fallback))).trim();
  if (raw === '') return fallback;
  const parsed = Number(raw);
  return (isFinite(parsed) && parsed >= 0) ? parsed : fallback;
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
    const paired = asLabelledAnswer_(value);
    if (paired) {
      out[paired.label] = paired.value;
      return out;
    }
    Object.keys(value).forEach(function (key) {
      flatten_(value[key], prefix ? prefix + '.' + key : key, out);
    });
    return out;
  }

  out[prefix] = value;
  return out;
}

/**
 * Reads an object that is really one labelled answer.
 *
 * {label: "First name", value: "Jaime"} means First name = Jaime, but
 * flattened naively it becomes two unrelated entries and the answer is lost.
 * The shape has to be unambiguous to qualify: exactly one label, exactly one
 * value, and nothing else but incidental bookkeeping.
 *
 * @param {!Object} obj
 * @return {?{label: string, value: *}}
 */
function asLabelledAnswer_(obj) {
  let label = null;
  let value = null;

  const keys = Object.keys(obj);
  if (!keys.length) return null;

  for (let i = 0; i < keys.length; i++) {
    const squashed = squashKey_(keys[i]);
    const entry = obj[keys[i]];
    if (LABEL_KEYS.indexOf(squashed) !== -1) {
      if (label !== null || typeof entry !== 'string' || !cleanText_(entry)) return null;
      label = cleanText_(entry);
    } else if (VALUE_KEYS.indexOf(squashed) !== -1) {
      if (value !== null) return null;
      value = entry;
    } else if (PAIR_INCIDENTAL_KEYS.indexOf(squashed) === -1) {
      return null;
    }
  }

  if (label === null || value === null) return null;
  if (value !== null && typeof value === 'object') return null;
  return { label: label, value: value };
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

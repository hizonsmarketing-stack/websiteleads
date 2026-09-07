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
  const cache = { byKey: {}, rowsByLeadId: {}, sheet: sheet, pending: [] };

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

/** Every value "Dedupe On" understands. Anything else is a typo. */
const DEDUPE_FIELDS = ['email', 'phone', 'date', 'name'];

/** The safe setting to fall back to, and what ships in _Settings. */
const DEDUPE_DEFAULT = ['email', 'phone'];

let DEDUPE_WARNED_ = false;

/**
 * Which contact fields to dedupe on, per _Settings.
 *
 * A word this does not recognise is dropped rather than obeyed, and if nothing
 * recognisable is left the default is used. Taking the setting literally meant
 * one typo — "e-mail", "phone number" — turned duplicate detection off
 * entirely and silently: every lead became unique, and the same client was
 * dealt to a different caller each time they enquired.
 *
 * @return {!Array<string>}
 */
function dedupeFields_() {
  const asked = String(setting_('Dedupe On', DEDUPE_DEFAULT.join(',')))
    .toLowerCase()
    .split(',')
    .map(function (f) { return f.trim(); })
    .filter(String);

  const known = asked.filter(function (f) { return DEDUPE_FIELDS.indexOf(f) !== -1; });
  const unknown = asked.filter(function (f) { return DEDUPE_FIELDS.indexOf(f) === -1; });

  // Once per execution: this is called for every lead, and an import would
  // otherwise write the same warning several hundred times.
  if (unknown.length && !DEDUPE_WARNED_) {
    DEDUPE_WARNED_ = true;
    log_('WARN', 'dedupe', 'Ignored an unrecognised "Dedupe On" value', {
      ignored: unknown,
      using: known.length ? known : DEDUPE_DEFAULT,
      understands: DEDUPE_FIELDS
    });
  }
  return known.length ? known : DEDUPE_DEFAULT.slice();
}

/**
 * The index keys a lead occupies, most reliable first.
 * @param {!Object} lead
 * @return {!Array<{key: string, matchedOn: string}>}
 */
function dedupeKeys_(lead) {
  const fields = dedupeFields_();
  const keys = [];

  // The sending system's own id for the submission — Google Ads sends one with
  // every lead. Checked first and never switched off: it is an exact identity
  // rather than a guess about who two records are, so it cannot match the
  // wrong person, and it is what makes a redelivered lead land on the row it
  // already created instead of being dealt out a second time.
  //
  // It lives only in the index, not in a column, so a rebuild does not restore
  // it. That costs nothing: a retry arrives within seconds of the original,
  // long before anybody rebuilds.
  if (lead.externalKey) {
    keys.push({ key: lead.externalKey, matchedOn: 'Lead ID from the source' });
  }
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
  // Last, because it is the weakest signal: two clients can share a name, and
  // merging two real people is worse than dealing one of them out twice. It
  // catches the case nothing else can — the same person filling in one form
  // that asks only for an email and another that asks only for a phone.
  if (fields.indexOf('name') !== -1 && lead.nameKey) {
    keys.push({ key: 'name:' + lead.nameKey, matchedOn: 'Name' });
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
  dedupeKeys_(lead).forEach(function (k) {
    if (index.byKey[k.key]) return;
    const entry = { key: k.key, leadId: lead.leadId, tab: tab, row: row, indexRow: 0 };
    index.byKey[k.key] = entry;
    index.pending.push(entry);
    if (!index.rowsByLeadId[lead.leadId]) index.rowsByLeadId[lead.leadId] = [];
    index.rowsByLeadId[lead.leadId].push(entry);
  });
}

/**
 * Writes buffered index entries in one go.
 *
 * Entries are buffered rather than appended one at a time because an import of
 * several hundred leads would otherwise make a separate write per contact
 * detail, which is what pushes a big import past the six-minute limit.
 */
function flushIndex_() {
  const index = INDEX_CACHE_;
  if (!index || !index.pending.length) return;

  const stamp = nowStamp_();
  const start = index.sheet.getLastRow() + 1;
  index.sheet.getRange(start, 1, index.pending.length, INDEX_COLUMNS.length).setValues(
    index.pending.map(function (entry) {
      return [entry.key, entry.leadId, entry.tab, entry.row, stamp];
    })
  );
  index.pending.forEach(function (entry, i) { entry.indexRow = start + i; });
  index.pending = [];
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
  // These entries are addressed by their row in _Index, so anything still
  // buffered has to reach the sheet before it can be updated.
  flushIndex_();
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
  dedupeKeys_(incoming).forEach(function (k) {
    if (index.byKey[k.key]) return;
    const added = {
      key: k.key,
      leadId: entry.leadId,
      tab: entry.tab,
      row: entry.row,
      indexRow: 0
    };
    index.byKey[k.key] = added;
    index.pending.push(added);
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
      // Resolved the same way the rest of the automation does, so a tab whose
      // phone column is called "Contact number" is indexed like any other.
      const bound = fieldColumns_(tab).byField;
      if (!bound.leadId) return;
      const width = tab.getLastColumn();
      const values = tab.getRange(2, 1, tab.getLastRow() - 1, width).getValues();
      const at = function (row, field) {
        return bound[field] ? row[bound[field] - 1] : '';
      };

      values.forEach(function (row, i) {
        const leadId = cleanText_(at(row, 'leadId'));
        if (!leadId) return;
        leads++;
        const stub = {
          emailKey: emailDedupeKey_(normalizeEmail_(at(row, 'email'))),
          phoneKey: normalizePhone_(at(row, 'phone')),
          nameKey: squashKey_(at(row, 'fullName')),
          eventDate: cleanText_(at(row, 'eventDate'))
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

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

    teamTabNames_().forEach(function (tabName) {
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

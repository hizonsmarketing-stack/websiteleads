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
    'Phone: ' + (lead.phone || '(not given)'),
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

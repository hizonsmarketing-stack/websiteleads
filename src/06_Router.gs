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

  return squashKey_(setting_('Assignment Order', 'balanced')) === 'roster'
    ? nextInRosterOrder_(candidates)
    : fewestSoFar_(candidates);
}

/**
 * Evens the split out: whoever has had the fewest leads gets the next one.
 *
 * Ties break on who was assigned longest ago, then alphabetically, so the
 * outcome is reproducible and can be explained to whoever thinks they were
 * skipped.
 *
 * @param {!Array<!Object>} candidates
 * @return {!Object}
 */
function fewestSoFar_(candidates) {
  return candidates.slice().sort(function (a, b) {
    if (a.count !== b.count) return a.count - b.count;
    if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? -1 : 1;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  })[0];
}

/**
 * Follows the order of the _Team tab, top to bottom and back to the top.
 *
 * The rotation is the roster itself — reorder the rows and the order changes,
 * with nothing else to edit. Where a lead's event type is covered by only some
 * of the team, the rest are stepped over rather than waited for, so a Corporate
 * lead does not stall the rotation on somebody who does not take corporate.
 *
 * Where the rotation stopped is remembered as a name rather than a position,
 * so inserting or reordering rows moves the rotation with them instead of
 * jumping. Last Assigned At cannot serve: it is written to the second, and
 * several leads landing in one second would leave the rotation unable to tell
 * which came last and stuck on one person.
 *
 * @param {!Array<!Object>} candidates Roster entries covering this event type.
 * @return {!Object}
 */
function nextInRosterOrder_(candidates) {
  const roster = loadTeam_().filter(function (member) {
    return member.active && member.tab;
  });
  if (!roster.length) return candidates[0];

  const eligible = {};
  candidates.forEach(function (member) { eligible[squashKey_(member.name)] = member; });

  // Nobody yet, or a name that has since left the roster, starts at the top.
  const last = PropertiesService.getScriptProperties().getProperty(ROTATION_KEY) || '';
  let at = -1;
  roster.forEach(function (member, i) {
    if (squashKey_(member.name) === last) at = i;
  });

  for (let step = 1; step <= roster.length; step++) {
    const member = roster[(at + step) % roster.length];
    const hit = eligible[squashKey_(member.name)];
    if (hit) return hit;
  }
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
  // Where a strict rotation carries on from. Written whichever order is in
  // use, so switching between them picks up from the right person.
  PropertiesService.getScriptProperties()
    .setProperty(ROTATION_KEY, squashKey_(member.name));
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.team);
  if (!sheet || !member.row) return;
  updateRowCells_(sheet, member.row, {
    'Assigned Count': member.count,
    'Last Assigned At': member.lastAt
  });
}

/**
 * Tells each caller their new leads are waiting.
 *
 * Sent once a tab has collected "Notify Every N Leads" of them rather than one
 * mail per lead: five arriving over a morning is one thing to sit down to, not
 * five interruptions. Set that to 1 to be told about every lead as it lands,
 * or turn "Notify On New Lead" off entirely.
 *
 * Called once per intake batch, and the count is per tab — so a caller who
 * reaches five is told while everyone else keeps accumulating. Nothing is lost
 * when the threshold is not met: the leads stay counted and go out with the
 * next batch that crosses it.
 *
 * Like every other alert here it ignores merged duplicates, because a
 * returning client is not a new lead to work.
 *
 * @param {!Object<string,number>} byTab Tabs touched by the batch just run.
 * @return {number} How many tabs were mailed.
 */
function maybeNotifyTabs_(byTab) {
  if (!settingIsOn_('Notify On New Lead')) return 0;
  const every = numberSetting_('Notify Every N Leads', 5);
  if (every <= 0) return 0;

  let sent = 0;
  Object.keys(byTab || {}).forEach(function (tabName) {
    const pending = pendingNotifyRows_(tabName);
    if (!pending || pending.count < every) return;
    try {
      if (sendTabNotice_(tabName, pending)) sent++;
    } catch (err) {
      log_('WARN', 'notify', 'Could not send the new-lead alert', {
        tab: tabName, error: String(err)
      });
    }
  });
  return sent;
}

/** Script property prefix holding the last row of a tab that was notified. */
/** Who the strict rotation last handed a lead to. */
const ROTATION_KEY = 'ROTATION_AT';

const NOTIFY_MARK_PREFIX = 'NOTIFY_MARK_';

/**
 * Which rows of a tab have landed since its last alert.
 *
 * Rows get deleted and moved by hand, so the marker is never allowed to point
 * past the end of the sheet — exactly as the digest guards its own. A tab seen
 * for the first time starts counting from where it already is, so switching
 * notifications on does not mail everyone their back catalogue.
 *
 * @param {string} tabName
 * @return {?{from: number, to: number, count: number}}
 */
function pendingNotifyRows_(tabName) {
  const sheet = getSpreadsheet_().getSheetByName(tabName);
  if (!sheet) return null;

  const key = NOTIFY_MARK_PREFIX + squashKey_(tabName);
  const props = PropertiesService.getScriptProperties();
  const lastRow = sheet.getLastRow();
  const stored = props.getProperty(key);

  // First time this tab is seen, start counting from now. Otherwise switching
  // notifications on would mail every caller their entire back catalogue.
  if (stored === null || stored === '') {
    props.setProperty(key, String(lastRow));
    return null;
  }

  let mark = Number(stored);
  if (!isFinite(mark) || mark < 1 || mark > lastRow) {
    mark = lastRow;
    props.setProperty(key, String(mark));
  }
  if (lastRow <= mark) return null;

  return { from: mark + 1, to: lastRow, count: lastRow - mark };
}

/**
 * Mails one tab's waiting leads and moves its marker forward.
 *
 * The marker moves whether or not anyone was listening, so a tab with no
 * recipients does not build up a backlog that floods the day somebody adds an
 * address to it.
 *
 * @param {string} tabName
 * @param {{from: number, to: number, count: number}} pending
 * @return {boolean} True when a mail actually went out.
 */
function sendTabNotice_(tabName, pending) {
  const props = PropertiesService.getScriptProperties();
  const markKey = NOTIFY_MARK_PREFIX + squashKey_(tabName);
  const sheet = getSpreadsheet_().getSheetByName(tabName);
  const columns = fieldColumns_(sheet).byField;
  const read = function (row, field) {
    const col = columns[field];
    return col ? cleanText_(sheet.getRange(row, col).getValue()) : '';
  };

  const leads = [];
  for (let row = pending.from; row <= pending.to; row++) {
    leads.push({
      name: read(row, 'fullName') || read(row, 'email') || read(row, 'phone') || '(no name given)',
      eventType: read(row, 'eventType'),
      eventDate: read(row, 'eventDate'),
      guests: read(row, 'guestCount'),
      presenter: read(row, 'presenter'),
      email: read(row, 'email'),
      phone: read(row, 'phone'),
      subSource: read(row, 'subSource')
    });
  }

  const recipients = [];
  const add = function (address) {
    const trimmed = cleanText_(address);
    if (trimmed && recipients.indexOf(trimmed) === -1) recipients.push(trimmed);
  };
  loadTeam_().forEach(function (member) {
    if (member.tab === tabName) add(member.email);
  });
  const notifyKeys = [tabName];
  leads.forEach(function (lead) {
    const type = resolveEventType_(lead.eventType);
    if (type && notifyKeys.indexOf(type.tab) === -1) notifyKeys.push(type.tab);
  });
  notifyKeys.forEach(function (key) {
    String(setting_('Notify - ' + key, '')).split(/[,;]/).forEach(add);
  });

  // Move the marker even with nobody listening, so adding an address later
  // does not deliver a month of backlog in one mail.
  props.setProperty(markKey, String(pending.to));
  if (!recipients.length) return false;

  const lines = leads.map(function (lead) {
    return [
      lead.name + (lead.eventType ? ' — ' + lead.eventType : ''),
      '  event date: ' + (lead.eventDate || '(not given)') +
        (lead.guests ? '   guests: ' + lead.guests : ''),
      '  contact: ' + (lead.email || '(no email)') + '   ' + (lead.phone || '(no phone)'),
      '  from: ' + (lead.subSource || 'unknown form') +
        (lead.presenter ? '   presenter: ' + lead.presenter : '')
    ].join('\n');
  });

  MailApp.sendEmail({
    to: recipients.join(','),
    subject: '[' + pending.count + ' new lead' + (pending.count === 1 ? '' : 's') +
      '] waiting on ' + tabName,
    body: [
      pending.count === 1
        ? 'A new lead is waiting on your ' + tabName + ' tab:'
        : pending.count + ' new leads are waiting on your ' + tabName + ' tab:',
      '',
      lines.join('\n\n'),
      '',
      getSpreadsheet_().getUrl()
    ].join('\n')
  });

  log_('INFO', 'notify', 'Told a tab about its new leads', {
    tab: tabName, count: pending.count
  });
  return true;
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

  // The client is known either way, so the incoming record carries on as the
  // same lead. Dealing it out again under a new id is what put one client in
  // two callers' tabs.
  incoming.leadId = entry.leadId;

  if (!sheet) {
    // The whole tab is gone, so there is no owner left to keep it with. Route
    // it properly and point the stale index entries at wherever it lands.
    log_('WARN', 'dedupe', 'Indexed tab is missing; re-routing this lead', entry);
    const placed = routeLead_(incoming);
    moveIndexEntries_(entry.leadId, placed.tab, placed.row);
    return Object.assign({ action: 'created' }, placed, { leadId: entry.leadId });
  }

  const row = findLeadRow_(sheet, entry.leadId, entry.row);
  if (!row) return refileWithSameOwner_(sheet, entry, incoming);
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
 * Puts a repeat inquiry back with the caller who already owns the client, when
 * the row it should have merged into has gone.
 *
 * A row disappears because somebody deleted it or moved it by hand — the index
 * still knows this contact, but there is nothing left to merge into. Dealing
 * the lead out again is the worst answer available: the client is known, and
 * the rotation hands them to a second caller, which is the one thing the index
 * exists to prevent. So the lead is written back to the same tab, keeping its
 * original id, and the index is pointed at the row just written.
 *
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet The owner's tab.
 * @param {!Object} entry The index entry whose row could not be found.
 * @param {!Object} incoming
 * @return {{action: string, tab: string, row: number, leadId: string}}
 */
function refileWithSameOwner_(sheet, entry, incoming) {
  log_('WARN', 'dedupe', 'Indexed row is gone; re-filing with the same caller', entry);

  const owner = memberByTab_(entry.tab);
  if (owner && !cleanText_(incoming.assignedTo)) incoming.assignedTo = owner.name;
  incoming.presenter = presenterFor_(
    incoming.eventTypeLabel, sheet.getLastRow() + 1, owner ? owner.name : '');

  const row = appendLead_(sheet, incoming);

  // All Leads keeps one row per lead. The old one usually survived whatever
  // removed the caller's copy, so it is updated rather than added to.
  const allLeads = getOrCreateSheet_(SHEETS.allLeads, LEAD_COLUMNS);
  if (!findLeadRow_(allLeads, entry.leadId, 0)) appendLead_(allLeads, incoming);

  moveIndexEntries_(entry.leadId, entry.tab, row);
  mergeIndexKeys_(incoming, { leadId: entry.leadId, tab: entry.tab, row: row });

  return { action: 'refiled', tab: entry.tab, row: row, leadId: entry.leadId };
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

  log_('INFO', 'router', 'Promoted lead out of ' + FALLBACK_EVENT_TYPE.tab, {
    leadId: leadId, to: targetTab, assignedTo: moved.assignedTo
  });
  return { tab: targetTab, row: newRow };
}

/** Keeps index row numbers correct after a row is deleted from a tab. */
function shiftIndexRowsAfterDelete_(tabName, deletedRow) {
  const index = loadIndex_();
  flushIndex_();
  Object.keys(index.byKey).forEach(function (key) {
    const entry = index.byKey[key];
    if (entry.tab !== tabName || entry.row <= deletedRow) return;
    entry.row -= 1;
    index.sheet.getRange(entry.indexRow, 4).setValue(entry.row);
  });
}

/**
 * Checks that a row really is a lead the automation owns, and reads it back.
 *
 * Shared by the move itself and by the menu, so the menu can say what is wrong
 * before it asks where the lead should go.
 *
 * @param {string} tabName
 * @param {number} row 1-based.
 * @return {{ok: boolean, problem: (string|undefined),
 *     sheet: (!GoogleAppsScript.Spreadsheet.Sheet|undefined),
 *     lead: (!Object|undefined), leadId: (string|undefined)}}
 */
function leadAtRow_(tabName, row) {
  const sheet = getSpreadsheet_().getSheetByName(tabName);
  if (!sheet) return { ok: false, problem: 'There is no tab called ' + tabName + '.' };
  if (leadTabNames_().indexOf(tabName) === -1) {
    return { ok: false, problem: tabName + ' is not a lead tab. Move leads from a ' +
      'salesperson\'s tab or a shared event-type tab.' };
  }
  if (!(row > 1) || row > sheet.getLastRow()) {
    return { ok: false, problem: 'Row ' + row + ' is not a lead. Click any cell on the ' +
      'lead\'s own row first — row 1 is the header.' };
  }
  const lead = readLeadRow_(sheet, row);
  const leadId = cleanText_(lead.leadId);
  if (!leadId) {
    return { ok: false, problem: 'That row has no Lead ID, so it is not a lead the ' +
      'automation knows about.' };
  }
  return { ok: true, sheet: sheet, lead: lead, leadId: leadId };
}

/**
 * Hands one lead to somebody else, everywhere the workbook records it.
 *
 * Copying a row from one tab to another by hand looks right and is not. The
 * dedupe index still points at the old tab, so the client's next submission is
 * merged into a row nobody is working; the roster's Assigned Count never
 * moves, so the rotation goes on feeding the receiver as though they were
 * still empty; All Leads keeps naming the wrong person; and the row left
 * behind is counted twice. This does the whole set in one pass, under the
 * document lock, so a hand-off cannot land half-done.
 *
 * The lead keeps its own history — touches, first seen, the message thread. It
 * is the same lead, in somebody else's hands.
 *
 * @param {string} fromTab The tab the lead is on now.
 * @param {number} row Its 1-based row on that tab.
 * @param {string} target A salesperson's name, or a tab name.
 * @return {{ok: boolean, problem: (string|undefined), name: (string|undefined),
 *     from: (string|undefined), to: (string|undefined), row: (number|undefined)}}
 */
function moveLead(fromTab, row, target) {
  return withLock_(function () {
    const found = leadAtRow_(fromTab, row);
    if (!found.ok) return found;
    const sheet = found.sheet;
    const lead = found.lead;
    const leadId = found.leadId;

    const member = namedMember_(target) || memberByTab_(target);
    const targetTab = (member && member.tab) || cleanText_(target);
    if (!targetTab || leadTabNames_().indexOf(targetTab) === -1) {
      return { ok: false, problem: 'No salesperson or lead tab called "' + target + '".\n\n' +
        'Pick one of: ' + leadTabNames_().join(', ') };
    }
    if (targetTab === fromTab) {
      return { ok: false, problem: 'That lead is already on ' + fromTab + '.' };
    }

    const moved = Object.assign({}, lead);
    const giver = memberByTab_(fromTab);

    // Coming out of Unassigned, a receiver who only ever handles one event type
    // settles what the lead is. Anyone covering several leaves it open, because
    // guessing here would be worse than the caller finding out and saying so.
    if (member && squashKey_(moved.eventTypeLabel) === squashKey_(FALLBACK_EVENT_TYPE.label)) {
      const only = member.eventTypes.length === 1 && member.eventTypes[0] !== '*'
        ? eventTypeByLabel_(member.eventTypes[0]) : null;
      if (only) moved.eventTypeLabel = only.label;
    }

    moved.assignedTo = member ? member.name : '';

    // Transferred is what the sender wrote when they let go of it. To the
    // receiver it is a lead nobody has worked, so it reads as one.
    if (squashKey_(moved.status) === squashKey_('Transferred')) moved.status = 'New';

    const targetSheet = getOrCreateSheet_(targetTab, LEAD_COLUMNS);
    // The presenter rotation runs down the destination tab by row, so the row
    // this is about to land on is the one that decides.
    moved.presenter = presenterFor_(
      cleanText_(moved.eventTypeLabel) || FALLBACK_EVENT_TYPE.label,
      targetSheet.getLastRow() + 1,
      member ? member.name : '');

    const note = '--- ' + nowStamp_() + ' moved from ' + fromTab + ' to ' + targetTab + ' ---';
    moved.message = (cleanText_(moved.message) ? moved.message + '\n\n' : '') + note;

    const newRow = appendLead_(targetSheet, moved);
    sheet.deleteRow(row);
    shiftIndexRowsAfterDelete_(fromTab, row);
    moveIndexEntries_(leadId, targetTab, newRow);
    syncAllLeadsRow_(leadId, {
      'Event Type': moved.eventTypeLabel,
      'Assigned To': moved.assignedTo,
      'Presenter': moved.presenter || '',
      'Status': moved.status,
      'Message': moved.message
    });

    // The rotation is "fewest so far wins", so a hand-off has to move the tally
    // as well as the row. Otherwise the receiver is fed as though they were
    // still empty and the sender is never credited for letting go.
    if (member) recordAssignment_(member);
    if (giver && giver !== member) creditHandoff_(giver);

    log_('INFO', 'router', 'Moved lead', {
      leadId: leadId, from: fromTab, to: targetTab, assignedTo: moved.assignedTo
    });
    return {
      ok: true,
      name: cleanText_(moved.fullName) || cleanText_(moved.email) || leadId,
      from: fromTab,
      to: targetTab,
      row: newRow,
      assignedTo: moved.assignedTo,
      eventType: cleanText_(moved.eventTypeLabel)
    };
  });
}

/** @return {?Object} The roster entry that owns a tab, or null. */
function memberByTab_(tabName) {
  const wanted = squashKey_(tabName);
  if (!wanted) return null;
  return loadTeam_().filter(function (member) {
    return squashKey_(member.tab) === wanted;
  })[0] || null;
}

/**
 * Gives back the count someone spent on a lead they have now handed on, so the
 * rotation offers them the next one. Never below zero: the tally is a queue
 * position, not a score to be settled.
 * @param {!Object} member
 */
function creditHandoff_(member) {
  if (!member.count) return;
  member.count -= 1;
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.team);
  if (!sheet || !member.row) return;
  updateRowCells_(sheet, member.row, { 'Assigned Count': member.count });
}

/**
 * Routing and distribution: which tab a lead lands in, which rep owns it, and
 * what happens when a lead we already have comes back through another channel.
 */

/**
 * Writes a brand-new lead to its team tab and to the All Leads master log.
 * @param {!Object} lead
 * @return {{tab: string, row: number}}
 */
function routeLead_(lead) {
  const tabName = lead.eventTypeTab || FALLBACK_EVENT_TYPE.tab;
  const teamSheet = getOrCreateSheet_(tabName, LEAD_COLUMNS);

  if (!lead.assignedTo) lead.assignedTo = nextAssignee_(tabName);

  const row = appendLead_(teamSheet, lead);
  appendLead_(getOrCreateSheet_(SHEETS.allLeads, LEAD_COLUMNS), lead);
  indexLead_(lead, tabName, row);

  notifyTeam_(lead, tabName);
  return { tab: tabName, row: row };
}

/**
 * Round-robin owner for a team tab. Reps come from the _Settings row
 * "Reps - <Tab>" as a comma-separated list; the rotation position is kept in
 * script properties so it survives across executions.
 * @param {string} tabName
 * @return {string} A rep name, or '' when assignment is off or unconfigured.
 */
function nextAssignee_(tabName) {
  if (!settingIsOn_('Round Robin Assignment')) return '';
  const reps = String(setting_('Reps - ' + tabName, ''))
    .split(',')
    .map(function (r) { return r.trim(); })
    .filter(String);
  if (!reps.length) return '';

  const props = PropertiesService.getScriptProperties();
  const key = 'RR_' + squashKey_(tabName);
  const position = Number(props.getProperty(key) || 0) % reps.length;
  props.setProperty(key, String((position + 1) % reps.length));
  return reps[position];
}

/**
 * Emails the team tab's watchers about a new lead, when configured.
 * Failures are logged, never thrown — a mail quota must not lose a lead.
 * @param {!Object} lead
 * @param {string} tabName
 */
function notifyTeam_(lead, tabName) {
  if (!settingIsOn_('Notify On New Lead')) return;
  const recipients = String(setting_('Notify - ' + tabName, ''))
    .split(/[,;]/)
    .map(function (r) { return r.trim(); })
    .filter(String);
  if (!recipients.length) return;

  const lines = [
    'Event type: ' + lead.eventTypeLabel,
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

  const target = getOrCreateSheet_(incoming.eventTypeTab, LEAD_COLUMNS);
  const moved = readLeadRow_(sheet, row);
  moved.eventTypeLabel = incoming.eventTypeLabel;
  moved.eventTypeRaw = incoming.eventTypeRaw || moved.eventTypeRaw;
  moved.leadId = leadId;
  if (!cleanText_(moved.assignedTo)) moved.assignedTo = nextAssignee_(incoming.eventTypeTab);

  const newRow = appendLead_(target, moved);
  sheet.deleteRow(row);
  shiftIndexRowsAfterDelete_(sheet.getName(), row);
  moveIndexEntries_(leadId, incoming.eventTypeTab, newRow);
  syncAllLeadsRow_(leadId, {
    'Event Type': incoming.eventTypeLabel,
    'Event Type (Raw)': incoming.eventTypeRaw || '',
    'Assigned To': moved.assignedTo
  });

  log_('INFO', 'router', 'Promoted lead out of ' + FALLBACK_EVENT_TYPE.tab, {
    leadId: leadId, to: incoming.eventTypeTab
  });
  return { tab: incoming.eventTypeTab, row: newRow };
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

/**
 * The periodic digest: one email to the sales team every N new leads.
 *
 * This is deliberately separate from the per-lead alert. That one tells the
 * assignee a lead is waiting; this one gives the team a picture of what has
 * come in and where it went, without anyone opening the sheet.
 *
 * Only genuinely new leads count. A returning client merged into a row someone
 * is already working is not a new lead, and importing years of history is not
 * ten new leads forty times over — the migration never triggers a digest.
 */

/** Script property holding the last All Leads row a digest covered. */
const DIGEST_MARK_KEY = 'DIGEST_MARK_ROW';

/**
 * Sends the digest when enough new leads have arrived since the last one.
 *
 * Called once per intake batch rather than once per lead, so a fair worksheet
 * that lands fifty leads sends one email covering all fifty rather than five
 * emails in a row.
 *
 * @param {number} createdCount New leads in the batch just processed.
 */
function maybeSendDigest_(createdCount) {
  if (!createdCount) return;
  const every = numberSetting_('Digest Every N Leads', 0);
  if (every <= 0) return;

  const pending = pendingDigestRows_();
  if (!pending || pending.count < every) return;

  try {
    sendDigest_(pending);
  } catch (err) {
    log_('WARN', 'digest', 'Could not send the digest', { error: String(err) });
  }
}

/**
 * Which rows of All Leads have arrived since the last digest.
 * @return {?{from: number, to: number, count: number}}
 */
function pendingDigestRows_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.allLeads);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  const props = PropertiesService.getScriptProperties();
  let mark = Number(props.getProperty(DIGEST_MARK_KEY) || 1);

  // Rows can be deleted by hand; never look further back than the sheet goes.
  if (mark < 1 || mark > lastRow) {
    mark = lastRow;
    props.setProperty(DIGEST_MARK_KEY, String(mark));
  }
  if (lastRow <= mark) return null;

  return { from: mark + 1, to: lastRow, count: lastRow - mark };
}

/**
 * Builds and sends the digest, then moves the marker forward.
 * @param {{from: number, to: number, count: number}} pending
 */
function sendDigest_(pending) {
  const recipients = digestRecipients_();
  const props = PropertiesService.getScriptProperties();

  if (!recipients.length) {
    log_('WARN', 'digest', 'No digest recipients set — skipping and holding the leads for next time');
    return;
  }

  const leads = readDigestLeads_(pending);
  if (!leads.length) {
    props.setProperty(DIGEST_MARK_KEY, String(pending.to));
    return;
  }

  const digest = buildDigest_(leads);
  MailApp.sendEmail({
    to: recipients.join(','),
    subject: digest.subject,
    body: digest.text,
    htmlBody: digest.html
  });

  props.setProperty(DIGEST_MARK_KEY, String(pending.to));
  log_('INFO', 'digest', 'Sent digest of ' + leads.length + ' leads', {
    to: recipients, rows: pending.from + '-' + pending.to
  });
}

/** @return {!Array<string>} Where the digest goes. */
function digestRecipients_() {
  return String(setting_('Digest Recipients', ''))
    .split(/[,;]/)
    .map(function (address) { return address.trim(); })
    .filter(String);
}

/**
 * Reads the leads a digest covers out of All Leads.
 * @param {{from: number, to: number}} pending
 * @return {!Array<!Object>}
 */
function readDigestLeads_(pending) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.allLeads);
  const bound = fieldColumns_(sheet).byField;
  const width = sheet.getLastColumn();
  const values = sheet.getRange(pending.from, 1, pending.to - pending.from + 1, width).getValues();

  const at = function (row, field) {
    return bound[field] ? cleanText_(row[bound[field] - 1]) : '';
  };

  return values.map(function (row) {
    return {
      receivedAt: at(row, 'receivedAt'),
      name: at(row, 'fullName') || at(row, 'email') || at(row, 'phone') || '(no name given)',
      email: at(row, 'email'),
      phone: at(row, 'phone'),
      eventType: at(row, 'eventTypeLabel') || FALLBACK_EVENT_TYPE.label,
      eventDate: at(row, 'eventDate'),
      guestCount: at(row, 'guestCount'),
      source: at(row, 'source'),
      subSource: at(row, 'subSource'),
      caller: at(row, 'assignedTo'),
      presenter: at(row, 'presenter')
    };
  }).filter(function (lead) {
    return lead.name !== '(no name given)' || lead.email || lead.phone;
  });
}

/**
 * Renders the digest.
 * @param {!Array<!Object>} leads
 * @return {{subject: string, text: string, html: string}}
 */
function buildDigest_(leads) {
  const byType = tally_(leads, function (lead) { return lead.eventType; });
  const byCaller = tally_(leads, function (lead) { return lead.caller || 'Unassigned'; });
  const bySource = tally_(leads, function (lead) { return lead.source || 'Unknown'; });

  const subject = leads.length + ' new lead' + (leads.length === 1 ? '' : 's') +
    ' — ' + describeTally_(byType);

  const textLines = [
    leads.length + ' new leads since the last digest.',
    '',
    'By event type:  ' + describeTally_(byType),
    'By caller:      ' + describeTally_(byCaller),
    'By source:      ' + describeTally_(bySource),
    ''
  ];
  leads.forEach(function (lead) {
    textLines.push([
      lead.name,
      lead.eventType,
      lead.eventDate ? 'event ' + lead.eventDate : '',
      lead.caller ? 'caller ' + lead.caller : 'unassigned',
      lead.presenter ? 'presenter ' + lead.presenter : '',
      [lead.phone, lead.email].filter(String).join(' / '),
      lead.source + (lead.subSource ? ' / ' + lead.subSource : '')
    ].filter(String).join(' · '));
  });
  textLines.push('', getSpreadsheet_().getUrl());

  const rows = leads.map(function (lead) {
    return '<tr>' + [
      escapeHtml_(lead.name),
      escapeHtml_(lead.eventType),
      escapeHtml_(lead.eventDate || '—'),
      escapeHtml_(lead.guestCount || '—'),
      escapeHtml_([lead.phone, lead.email].filter(String).join('<br>')),
      escapeHtml_(lead.caller || '—'),
      escapeHtml_(lead.presenter || '—'),
      escapeHtml_(lead.source + (lead.subSource ? ' / ' + lead.subSource : ''))
    ].map(function (cell) {
      return '<td style="padding:6px 10px;border-bottom:1px solid #e3e8e6;' +
        'font-size:13px;vertical-align:top">' + cell + '</td>';
    }).join('') + '</tr>';
  }).join('');

  const head = ['Name', 'Event type', 'Date', 'Guests', 'Contact', 'Caller', 'Presenter', 'Source']
    .map(function (label) {
      return '<th style="padding:6px 10px;border-bottom:2px solid #1c3d5a;text-align:left;' +
        'font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#4a5c57">' +
        label + '</th>';
    }).join('');

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#131c1a">' +
    '<h2 style="margin:0 0 4px;font-size:18px">' + leads.length + ' new lead' +
      (leads.length === 1 ? '' : 's') + '</h2>' +
    '<p style="margin:0 0 16px;color:#5b6c67;font-size:13px">Since the last digest.</p>' +
    '<p style="margin:0 0 4px;font-size:13px"><strong>By event type:</strong> ' +
      escapeHtml_(describeTally_(byType)) + '</p>' +
    '<p style="margin:0 0 4px;font-size:13px"><strong>By caller:</strong> ' +
      escapeHtml_(describeTally_(byCaller)) + '</p>' +
    '<p style="margin:0 0 16px;font-size:13px"><strong>By source:</strong> ' +
      escapeHtml_(describeTally_(bySource)) + '</p>' +
    '<table style="border-collapse:collapse;width:100%"><thead><tr>' + head +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p style="margin:18px 0 0;font-size:13px"><a href="' + getSpreadsheet_().getUrl() +
      '">Open the sales worksheet</a></p></div>';

  return { subject: subject, text: textLines.join('\n'), html: html };
}

/** @return {!Object<string,number>} Counts keyed by whatever `key` returns. */
function tally_(items, key) {
  const counts = {};
  items.forEach(function (item) {
    const label = key(item) || '—';
    counts[label] = (counts[label] || 0) + 1;
  });
  return counts;
}

/** @return {string} "Wedding 4, Corporate 3", biggest first. */
function describeTally_(counts) {
  return Object.keys(counts)
    .sort(function (a, b) { return counts[b] - counts[a] || (a < b ? -1 : 1); })
    .map(function (label) { return label + ' ' + counts[label]; })
    .join(', ');
}

/** @return {string} Text safe to drop into the digest's HTML. */
function escapeHtml_(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;br&gt;/g, '<br>');
}

/**
 * Tells someone a lead could not be routed.
 *
 * An Unassigned lead is the one case where the automation has done all it can
 * and a person has to look: the wording on the form matched no event type, so
 * nobody owns it and no presenter is set. Waiting for someone to notice the
 * tab is how a lead goes cold, so this says so at the moment it happens.
 *
 * Sent per batch rather than per lead, for the same reason the digest is: a
 * fair worksheet with forty unroutable rows is one problem to look at, not
 * forty emails. It is deliberately independent of "Notify On New Lead" —
 * wanting to hear about routing failures is not the same as wanting a mail for
 * every lead — and, like every other alert here, it ignores merged duplicates.
 *
 * The raw wording is the useful part: it is what to add to a keyword list in
 * 00_Config.gs so the next lead like it routes itself.
 *
 * @param {!Array<!Object>} results Per-record results from intakeBatch_.
 * @return {number} How many leads were reported.
 */
function maybeNotifyUnassigned_(results) {
  const recipients = String(setting_('Notify Unassigned To', ''))
    .split(/[,;]/)
    .map(function (address) { return address.trim(); })
    .filter(function (address) { return address !== ''; });
  if (!recipients.length) return 0;

  const landed = (results || []).filter(function (result) {
    return result.action === 'created' && result.tab === SHEETS.unassigned && result.row;
  });
  if (!landed.length) return 0;

  const sheet = getSpreadsheet_().getSheetByName(SHEETS.unassigned);
  if (!sheet) return 0;
  const columns = fieldColumns_(sheet).byField;
  const read = function (row, field) {
    const col = columns[field];
    return col ? cleanText_(sheet.getRange(row, col).getValue()) : '';
  };

  const lines = landed.map(function (result) {
    const wording = read(result.row, 'eventTypeRaw');
    return [
      read(result.row, 'fullName') || '(no name given)',
      '  wording on the form: ' + (wording ? '"' + wording + '"' : '(nothing sent)'),
      '  from: ' + (read(result.row, 'subSource') || 'unknown form'),
      '  contact: ' + (read(result.row, 'email') || read(result.row, 'phone') || '(none)')
    ].join('\n');
  });

  const count = landed.length;
  const subject = count === 1
    ? '[Unassigned lead] ' + (read(landed[0].row, 'fullName') || 'needs an event type')
    : '[' + count + ' unassigned leads] nobody could be assigned';

  try {
    MailApp.sendEmail({
      to: recipients.join(','),
      subject: subject,
      body: [
        count === 1
          ? 'A lead arrived without an event type, so nobody has been assigned to it:'
          : count + ' leads arrived without an event type, so nobody has been assigned to them:',
        '',
        lines.join('\n\n'),
        '',
        'They are waiting on the ' + SHEETS.unassigned + ' tab. Set the event type and they',
        'route themselves; if the same wording keeps arriving, add it to that event',
        'type\'s keyword list so it is handled next time.',
        '',
        getSpreadsheet_().getUrl()
      ].join('\n')
    });
  } catch (err) {
    log_('WARN', 'notify', 'Could not send the unassigned alert', { error: String(err) });
    return 0;
  }

  log_('INFO', 'notify', 'Reported unassigned leads', { count: count });
  return count;
}

/**
 * Menu action: send a digest now, whatever the count is at.
 * @return {string} What happened, for the alert.
 */
function sendDigestNow() {
  const pending = pendingDigestRows_();
  if (!pending) return 'No new leads since the last digest.';
  if (!digestRecipients_().length) {
    return 'Nobody to send it to. Add addresses to the "Digest Recipients" row of ' +
      SHEETS.settings + ' first.';
  }
  sendDigest_(pending);
  return 'Sent a digest of ' + pending.count + ' lead' + (pending.count === 1 ? '' : 's') + '.';
}

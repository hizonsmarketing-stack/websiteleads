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

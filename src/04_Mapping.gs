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

/**
 * Spots a value that is really an unfilled placeholder.
 *
 * A form builder's body can be saved with its tokens never substituted, in
 * which case every field arrives holding its own name — "field:full_name" as
 * the answer to field:full_name. Taken at face value that produces a lead
 * called field:full_name, which looks like a real lead and is not. Better to
 * drop it and say the form is misconfigured.
 *
 * @param {string} key
 * @param {string} value
 * @return {boolean}
 */
function isPlaceholderValue_(key, value) {
  const text = cleanText_(value);
  if (!text) return false;
  if (squashKey_(text) === squashKey_(key)) return true;
  if (/^field\s*:/i.test(text)) return true;
  if (/^\{\{.*\}\}$/.test(text)) return true;
  return false;
}

/**
 * Spots an answer that says nothing.
 *
 * "N/A" is not a venue, and TRUE/FALSE is not a phone number, but both match
 * their column's aliases perfectly well and would take the slot from a real
 * answer arriving under a vaguer name. A guest who has not chosen a venue is
 * better served by a blank cell than by the word "No" sitting where a venue
 * should be — so these are demoted into the Message column, where the reply is
 * still visible to whoever works the lead.
 *
 * Message itself is exempt: there, "No" is the answer to a question and reads
 * correctly next to it.
 *
 * @param {string} value Already passed through cleanText_().
 * @return {boolean}
 */
function isNonAnswer_(value) {
  return NON_ANSWERS.indexOf(squashKey_(value)) !== -1;
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
 *
 * `score` separates two keys that land on the same field: it is the share of
 * the key the matching alias accounts for, so "field:full_name" beats
 * "field:contact_person_from_hizons_catering" for Full Name.
 *
 * @param {string} key
 * @return {{field: string, quality: number, score: number}} quality 2 = exact,
 *     1 = contained, 0 = no match.
 */
function matchField_(key) {
  const index = aliasIndex_();
  const squashed = squashKey_(key);
  if (!squashed) return { field: '', quality: 0, score: 0 };
  if (index[squashed]) return { field: index[squashed], quality: 2, score: 1 };

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
  if (best) return { field: best, quality: 1, score: bestLength / squashed.length };

  for (let i = 0; i < FIELD_SUFFIX_RULES.length; i++) {
    const rule = FIELD_SUFFIX_RULES[i];
    if (squashed.length > rule.suffix.length &&
        squashed.slice(-rule.suffix.length) === rule.suffix) {
      return { field: rule.field, quality: 1, score: rule.suffix.length / squashed.length };
    }
  }
  return { field: '', quality: 0, score: 0 };
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
 *           messages: !Array<{label: string, value: string}>,
 *           placeholders: number}}
 */
function mapRecord_(flat) {
  const fields = {};
  const quality = {};
  const scores = {};
  const labels = {};
  const extras = [];
  const messages = [];
  let placeholders = 0;

  Object.keys(flat).forEach(function (path) {
    const value = cleanText_(flat[path]);
    if (value === '') return;

    const label = leafKey_(path);
    if (isNoiseKey_(label)) return;
    if (isPlaceholderValue_(label, value)) {
      placeholders++;
      return;
    }

    const pretty = humanizeKey_(label);
    const match = matchField_(label);

    if (!match.field) {
      extras.push({ label: pretty, value: value });
      return;
    }

    // A non-answer never occupies a real column, but is still worth reading.
    if (match.field !== 'message' && isNonAnswer_(value)) {
      extras.push({ label: pretty, value: value });
      return;
    }

    // Free text accumulates instead of competing for one slot.
    if (match.field === 'message') {
      messages.push({ label: pretty, value: value });
      if (fields.message === undefined) fields.message = value;
      return;
    }

    const beatsIncumbent = quality[match.field] === undefined ? false
      : (match.quality > quality[match.field] ||
         (match.quality === quality[match.field] && match.score > scores[match.field]));

    if (quality[match.field] === undefined) {
      fields[match.field] = value;
      quality[match.field] = match.quality;
      scores[match.field] = match.score;
      labels[match.field] = pretty;
    } else if (beatsIncumbent) {
      extras.push({ label: labels[match.field], value: fields[match.field] });
      fields[match.field] = value;
      quality[match.field] = match.quality;
      scores[match.field] = match.score;
      labels[match.field] = pretty;
    } else {
      extras.push({ label: pretty, value: value });
    }
  });

  return { fields: fields, extras: extras, messages: messages, placeholders: placeholders };
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
    // Wix prefixes every form field with "field:"; it means nothing to a rep.
    .replace(/^\s*field\s*:\s*/i, '')
    .replace(/[_\-.:]+/g, ' ')
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

  // Contact details are stored exactly as the person wrote them. The tidied
  // forms are computed for matching only and never reach the sheet: a rep
  // dials what the guest actually gave us.
  const email = cleanText_(fields.email);
  const phone = cleanText_(fields.phone);
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
    emailKey: emailDedupeKey_(normalizeEmail_(fields.email)),
    phoneKey: normalizePhone_(fields.phone)
  };
}

let SOURCES_CACHE_ = null;

/**
 * Reads the _Sources registry once per execution.
 *
 * It used to be re-read for every single lead, which is fine for one webhook
 * call and ruinous for an import of several hundred rows.
 *
 * @return {!Object}
 */
function loadSources_() {
  if (SOURCES_CACHE_) return SOURCES_CACHE_;
  const sheet = getOrCreateSheet_(SHEETS.sources, SOURCES_COLUMNS);
  const map = headerMap_(sheet);
  const col = {
    source: map[squashKey_('Source')],
    raw: map[squashKey_('Sub-Source (as received)')],
    label: map[squashKey_('Display Name')],
    eventType: map[squashKey_('Default Event Type')],
    active: map[squashKey_('Active')],
    firstSeen: map[squashKey_('First Seen')],
    lastSeen: map[squashKey_('Last Seen')],
    count: map[squashKey_('Lead Count')],
    notes: map[squashKey_('Notes')]
  };

  const byKey = {};
  if (sheet.getLastRow() > 1) {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    values.forEach(function (row, i) {
      const raw = cleanText_(row[col.raw - 1]);
      if (!raw) return;
      byKey[squashKey_(raw)] = {
        row: i + 2,
        source: cleanText_(row[col.source - 1]),
        label: cleanText_(row[col.label - 1]) || raw,
        defaultEventType: cleanText_(row[col.eventType - 1]),
        count: Number(row[col.count - 1]) || 0,
        added: 0
      };
    });
  }

  SOURCES_CACHE_ = { sheet: sheet, col: col, byKey: byKey, touched: {} };
  return SOURCES_CACHE_;
}

/**
 * Looks a form or fair up in the _Sources registry, adding it when it is new.
 *
 * This is how sub-sources get added "along the way": the first lead from an
 * unrecognised form registers itself with the raw identifier as its name, and
 * the team can then give it a friendlier display name or a default event type
 * without touching any code.
 *
 * Counts are tallied in memory and written back by flushSubSources_ at the end
 * of the batch, so importing four hundred leads writes one row, not eight
 * hundred cells.
 *
 * @param {string} source One of SOURCES.
 * @param {string} rawSubSource The identifier as received.
 * @param {string=} seedEventType Default event type to store when this
 *     sub-source is being registered for the first time.
 * @return {{source: string, label: string, defaultEventType: string}}
 */
function resolveSubSource_(source, rawSubSource, seedEventType) {
  const cache = loadSources_();
  const raw = cleanText_(rawSubSource) || 'Unknown Form';
  const key = squashKey_(raw);
  let entry = cache.byKey[key];

  if (!entry) {
    const newRow = new Array(cache.sheet.getLastColumn()).fill('');
    newRow[cache.col.source - 1] = source;
    newRow[cache.col.raw - 1] = raw;
    newRow[cache.col.label - 1] = raw;
    newRow[cache.col.eventType - 1] = cleanText_(seedEventType);
    newRow[cache.col.active - 1] = 'yes';
    newRow[cache.col.firstSeen - 1] = nowStamp_();
    newRow[cache.col.lastSeen - 1] = nowStamp_();
    newRow[cache.col.count - 1] = 0;
    if (looksLikeDefaultFormName_(raw)) {
      newRow[cache.col.notes - 1] =
        'This is the form builder\'s default name. Rename the form in Wix so its ' +
        'leads can be told apart from other forms, or set a Display Name here.';
      log_('WARN', 'sources', 'Form is still using its builder default name', { subSource: raw });
    }
    cache.sheet.appendRow(newRow);

    entry = {
      row: cache.sheet.getLastRow(),
      source: source,
      label: raw,
      defaultEventType: cleanText_(seedEventType),
      count: 0,
      added: 0
    };
    cache.byKey[key] = entry;
    log_('INFO', 'sources', 'Registered new sub-source', { source: source, subSource: raw });
  }

  entry.added += 1;
  cache.touched[key] = true;

  return {
    source: entry.source || source,
    label: entry.label || raw,
    defaultEventType: entry.defaultEventType
  };
}

/** Writes the tallied Last Seen and Lead Count values back to _Sources. */
function flushSubSources_() {
  const cache = SOURCES_CACHE_;
  if (!cache) return;
  const stamp = nowStamp_();
  Object.keys(cache.touched).forEach(function (key) {
    const entry = cache.byKey[key];
    if (!entry || !entry.added) return;
    cache.sheet.getRange(entry.row, cache.col.lastSeen).setValue(stamp);
    cache.sheet.getRange(entry.row, cache.col.count).setValue(entry.count + entry.added);
    entry.count += entry.added;
    entry.added = 0;
  });
  cache.touched = {};
}

/**
 * Names a form builder gives a form when nobody has renamed it.
 *
 * Every unnamed Wix form arrives as "My form", so without this every form on
 * the site collapses into one sub-source and the point of tracking them is
 * lost. It still works — it is just no longer telling you anything.
 *
 * @param {string} name
 * @return {boolean}
 */
function looksLikeDefaultFormName_(name) {
  const squashed = squashKey_(name);
  if (!squashed) return true;
  return /^(myform|form|newform|untitled|untitledform|contactform|webform)\d*$/.test(squashed);
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

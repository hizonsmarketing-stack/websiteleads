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

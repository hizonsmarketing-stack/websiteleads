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
 * already carry a different country code are preserved as-is, including when
 * the + was left off — see looksInternational_.
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
  } else if (looksInternational_(digits, cc)) {
    // Somebody abroad who left the + off. Take it as written.
  } else if (digits.length <= 10) {
    digits = cc + digits;
  }

  if (digits.length < 8 || digits.length > 15) return '';
  return '+' + digits;
}

/**
 * Decides whether digits typed without a + already carry a country code.
 *
 * The hard case is that a local mobile written without its 0 — 9171234567 —
 * begins with 91, which is India's calling code. A local number is therefore
 * always read as local first: anything starting with the local mobile prefix
 * and short enough to be a local number is never treated as international.
 *
 * What is left must both start with a recognised calling code and be long
 * enough to be a real number in that country, so a short local landline like
 * 81234567 is not mistaken for Japan.
 *
 * @param {string} digits Digits only.
 * @param {string} cc The default country code.
 * @return {boolean}
 */
function looksInternational_(digits, cc) {
  const localMobile = String(setting_('Local Mobile Prefix', '9')).replace(/\D/g, '');
  if (localMobile && digits.length <= 10 && digits.indexOf(localMobile) === 0) return false;
  if (digits.length < 10) return false;

  const codes = INTERNATIONAL_DIAL_CODES.slice().sort(function (a, b) {
    return b.length - a.length;
  });
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === cc) continue;
    if (digits.indexOf(code) === 0 && digits.length - code.length >= 7) return true;
  }
  return false;
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

/**
 * Decides whether a date written by a human can be read with certainty.
 *
 * "03/15/2027" can only be March 15th; "15/03/2027" can only be the same day
 * written the other way round; but "03/04/2027" is March 4th in one person's
 * sheet and April 3rd in another's. Where several people have typed into the
 * same column over the years, the only honest answer for that third case is
 * "ask a human" — guessing moves real bookings by weeks.
 *
 * @param {*} raw
 * @return {{status: string, value: string, original: string}}
 *     status is 'iso' (value holds yyyy-MM-dd), 'ambiguous' (day and month
 *     could swap), or 'unreadable' (not a date at all).
 */
function classifyDate_(raw) {
  const original = cleanText_(raw);
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return { status: 'iso', value: formatDate_(raw), original: original };
  }
  if (!original) return { status: 'unreadable', value: '', original: '' };

  const iso = original.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const built = buildDate_(+iso[1], +iso[2], +iso[3], '');
    return built
      ? { status: 'iso', value: built, original: original }
      : { status: 'unreadable', value: '', original: original };
  }

  const parts = original.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\s*$/);
  if (parts) {
    let a = +parts[1], b = +parts[2], year = +parts[3];
    if (year < 100) year += 2000;
    if (a > 12 && b > 12) return { status: 'unreadable', value: '', original: original };
    // 06/06/2027 is the sixth of June whichever way round it was meant.
    if (a === b) {
      const same = buildDate_(year, a, b, '');
      return same ? { status: 'iso', value: same, original: original }
                  : { status: 'unreadable', value: '', original: original };
    }
    if (a > 12) {
      const built = buildDate_(year, b, a, '');
      return built ? { status: 'iso', value: built, original: original }
                   : { status: 'unreadable', value: '', original: original };
    }
    if (b > 12) {
      const built = buildDate_(year, a, b, '');
      return built ? { status: 'iso', value: built, original: original }
                   : { status: 'unreadable', value: '', original: original };
    }
    return { status: 'ambiguous', value: '', original: original };
  }

  // Anything with a month name or a full timestamp reads only one way.
  const parsed = new Date(original);
  if (!isNaN(parsed.getTime()) && /\d{4}/.test(original) && /[A-Za-z]/.test(original)) {
    return { status: 'iso', value: formatDate_(parsed), original: original };
  }
  return { status: 'unreadable', value: '', original: original };
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

  // What the form was actually asked decides, whenever it says anything at all.
  // Otherwise a lead collected at "WEB EXHIBIT - WEDDING LIBRARY" who answered
  // "Kiddie" would be filed as a wedding, because the fair's name carries the
  // longer keyword. The surrounding wording is evidence only when the answer
  // is not.
  const answered = matchByKeyword_([primary]);
  if (answered) return answered;

  const context = (extraContext || []).map(function (t) {
    return cleanText_(t).toLowerCase();
  });
  return matchByKeyword_(context) || FALLBACK_EVENT_TYPE;
}

/**
 * Best keyword match across some haystacks, or null.
 *
 * Longer keywords are more specific, so "18th birthday" beats "birthday";
 * earlier haystacks are stronger evidence, which only separates two matches of
 * the same length.
 *
 * @param {!Array<string>} haystacks Already lowercased.
 * @return {?Object} An entry of EVENT_TYPES.
 */
function matchByKeyword_(haystacks) {
  let best = null;
  let bestScore = 0;
  haystacks.filter(String).forEach(function (haystack, depth) {
    EVENT_TYPES.forEach(function (type) {
      type.keywords.forEach(function (keyword) {
        if (haystack.indexOf(keyword) === -1) return;
        const score = keyword.length * 10 - depth;
        if (score > bestScore) {
          bestScore = score;
          best = type;
        }
      });
    });
  });
  return best;
}

/** @return {!Object} The event type whose tab matches `tabName`, or the fallback. */
function eventTypeByTab_(tabName) {
  const match = allEventTypes_().filter(function (t) { return t.tab === tabName; })[0];
  return match || FALLBACK_EVENT_TYPE;
}

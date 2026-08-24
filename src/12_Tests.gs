/**
 * Self-test. Runs the pure logic — normalisation, field mapping, event-type
 * routing, payload parsing — against known inputs. It never writes a lead, so
 * it is safe to run on the live workbook (Leads > Run self-test).
 */

/**
 * @return {{summary: string, detail: string, failures: number}}
 */
function runSelfTest() {
  const results = [];

  function check(name, actual, expected) {
    const pass = String(actual) === String(expected);
    results.push({
      pass: pass,
      line: (pass ? 'PASS  ' : 'FAIL  ') + name +
        (pass ? '' : '\n        expected: ' + expected + '\n        actual:   ' + actual)
    });
  }

  // --- Phone normalisation -------------------------------------------------
  check('phone: 0917 format', normalizePhone_('0917 123 4567', '63'), '+639171234567');
  check('phone: punctuated', normalizePhone_('(0917) 123-4567', '63'), '+639171234567');
  check('phone: already +63', normalizePhone_('+63 917 123 4567', '63'), '+639171234567');
  check('phone: bare 63 prefix', normalizePhone_('639171234567', '63'), '+639171234567');
  check('phone: no leading zero', normalizePhone_('9171234567', '63'), '+639171234567');
  check('phone: two numbers keeps first', normalizePhone_('0917 123 4567 / 0918 765 4321', '63'), '+639171234567');
  check('phone: foreign number kept', normalizePhone_('+1 415 555 0132', '63'), '+14155550132');
  check('phone: junk rejected', normalizePhone_('n/a', '63'), '');

  // --- Email normalisation -------------------------------------------------
  check('email: trimmed and lowered', normalizeEmail_('  Maria.Cruz@Gmail.COM '), 'maria.cruz@gmail.com');
  check('email: invalid rejected', normalizeEmail_('not an email'), '');
  check('email: plus tag stripped for matching',
    emailDedupeKey_('maria+expo@gmail.com') === emailDedupeKey_('maria@gmail.com'), 'true');

  // --- Names ---------------------------------------------------------------
  check('name: split', splitName_('Maria Clara Cruz').lastName, 'Clara Cruz');
  check('name: all caps tidied', tidyName_('MARIA CRUZ'), 'Maria Cruz');

  // --- Dates and guest counts ---------------------------------------------
  check('date: ISO', normalizeDate_('2026-12-14'), '2026-12-14');
  check('date: US slash', normalizeDate_('12/14/2026'), '2026-12-14');
  check('date: day-first when unambiguous', normalizeDate_('14/12/2026'), '2026-12-14');
  check('date: unparseable kept', normalizeDate_('sometime next year'), 'sometime next year');
  check('guests: prose', normalizeGuestCount_('around 150 pax'), '150');
  check('guests: range', normalizeGuestCount_('100 - 150'), '100-150');

  // --- Event type routing --------------------------------------------------
  check('route: exact label', resolveEventType_('Corporate').tab, 'Corporate');
  check('route: corporate wording', resolveEventType_('Company Christmas Party').tab, 'Corporate');
  check('route: wedding wording', resolveEventType_('Church Wedding Reception').tab, 'Wedding');
  check('route: debut', resolveEventType_('Debut / 18th Birthday').tab, 'Debut');
  check('route: 18th beats plain birthday', resolveEventType_('18th Birthday Party').tab, 'Debut');
  check('route: kiddie party', resolveEventType_('Kiddie Party').tab, "Kid's Party");
  check('route: christening', resolveEventType_('Christening / Baptism').tab, "Kid's Party");
  check('route: 1st birthday is a kids party', resolveEventType_('1st Birthday').tab, "Kid's Party");
  check('route: plain birthday is private', resolveEventType_('Birthday celebration').tab, 'Private Event');
  check('route: corporate anniversary stays corporate',
    resolveEventType_('Corporate Anniversary').tab, 'Corporate');
  check('route: wedding anniversary is private',
    resolveEventType_('Wedding Anniversary').tab, 'Private Event');
  check('route: private wording', resolveEventType_('Intimate family gathering').tab, 'Private Event');
  check('route: blank falls back', resolveEventType_('').tab, FALLBACK_EVENT_TYPE.tab);
  check('route: unknown falls back', resolveEventType_('Bar mitzvah').tab, FALLBACK_EVENT_TYPE.tab);
  check('route: context used when field is blank',
    resolveEventType_('', ['Looking for a venue for our wedding reception']).tab, 'Wedding');

  // --- Field mapping -------------------------------------------------------
  check('map: contact no -> phone', matchField_('Contact No.').field, 'phone');
  check('map: Google Ads column id', matchField_('PHONE_NUMBER').field, 'phone');
  check('map: question-style header', matchField_('What type of event are you planning?').field, 'eventType');
  check('map: noise ignored', isNoiseKey_('g-recaptcha-response'), 'true');
  check('map: unknown "... Date" header', matchField_('Wedding Date').field, 'eventDate');
  check('map: alias still beats the suffix rule', matchField_('Date Received').field, 'receivedAt');

  const mapped = mapRecord_({
    'Full Name': 'Ana Reyes',
    'Email Address': 'ana@example.com',
    'Mobile Number': '09171234567',
    'Type of Event': 'Corporate Seminar',
    'How did you hear about us': 'Instagram'
  });
  check('map: name captured', mapped.fields.fullName, 'Ana Reyes');
  check('map: unknown answer kept as extra', mapped.extras.length, 1);
  check('map: extra label humanised', mapped.extras[0].label, 'How Did You Hear About Us');

  // --- Payload parsing -----------------------------------------------------
  const wix = flatten_({
    formName: 'Homepage Inquiry',
    data: { contact: { name: 'Jose Rizal', email: 'jose@example.com' }, eventType: 'Wedding' },
    tags: ['website', 'inquiry']
  });
  check('flatten: nested value', wix['data.contact.email'], 'jose@example.com');
  check('flatten: scalar array joined', wix['tags'], 'website, inquiry');
  check('flatten: leaf key', leafKey_('data.contact.email'), 'email');
  check('flatten: header with trailing dot', leafKey_('Contact No.'), 'Contact No');
  check('flatten: array index skipped', leafKey_('items.0.name'), 'name');

  const ads = flattenGoogleAds_({
    lead_id: 'abc',
    form_id: 987,
    campaign_id: 555,
    user_column_data: [
      { column_id: 'FULL_NAME', column_name: 'Full Name', string_value: 'Pedro Santos' },
      { column_id: 'PHONE_NUMBER', column_name: 'Phone Number', string_value: '+639181234567' },
      { column_id: 'What is the occasion?', column_name: 'What is the occasion?', string_value: 'Debut' }
    ]
  });
  check('ads: name extracted', ads['Full Name'], 'Pedro Santos');
  check('ads: campaign carried', ads['campaign_id'], 555);
  check('ads: detected as Google Ads', looksLikeGoogleAds_({ user_column_data: [] }), 'true');
  check('ads: plain payload not misdetected', looksLikeGoogleAds_({ email: 'x@y.com' }), 'false');

  const adsMapped = mapRecord_(ads);
  check('ads: routed by custom question',
    resolveEventType_(adsMapped.fields.eventType).tab, 'Debut');

  // --- Header detection ----------------------------------------------------
  const worksheet = [
    ['Wedding Expo Manila 2026 — Exhibitor Leads', '', '', ''],
    ['Booth 14', '', '', ''],
    ['Name', 'Contact No.', 'Email Address', 'Event Date'],
    ['Liza Manalo', '0917 123 4567', 'liza@example.com', '12/14/2026']
  ];
  check('worksheet: header row found', detectHeaderRow_(worksheet), 2);

  // --- Dedupe keys ---------------------------------------------------------
  const keys = dedupeKeys_({
    emailKey: 'ana@example.com', phoneKey: '+639171234567', eventDate: '2026-12-14'
  });
  check('dedupe: email and phone keys built', keys.length >= 2, 'true');

  const failures = results.filter(function (r) { return !r.pass; });
  const summary = failures.length
    ? failures.length + ' of ' + results.length + ' checks FAILED.'
    : 'All ' + results.length + ' checks passed.';

  const detail = results.map(function (r) { return r.line; }).join('\n');
  console.log(summary + '\n' + detail);
  return { summary: summary, detail: detail, failures: failures.length };
}

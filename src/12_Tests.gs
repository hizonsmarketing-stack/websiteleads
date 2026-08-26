/**
 * Self-test. Runs the pure logic — normalisation, field mapping, event-type
 * routing, payload parsing — against known inputs, then checks the _Team
 * roster for the mistakes that would quietly stop leads reaching people.
 * It never writes anything, so it is safe to run on the live workbook
 * (Leads > Run self-test).
 */

/**
 * @return {{summary: string, detail: string, failures: number,
 *           roster: !Array<string>}}
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

  // Numbers from abroad, with and without the + people forget to type.
  check('phone: US with plus', normalizePhone_('+1 415 555 0132', '63'), '+14155550132');
  check('phone: US with 00', normalizePhone_('001 415 555 0132', '63'), '+14155550132');
  check('phone: US bare code', normalizePhone_('1 415 555 0132', '63'), '+14155550132');
  check('phone: Singapore with plus', normalizePhone_('+65 9123 4567', '63'), '+6591234567');
  check('phone: Singapore without plus', normalizePhone_('65 9123 4567', '63'), '+6591234567');
  check('phone: Hong Kong without plus', normalizePhone_('852 5123 4567', '63'), '+85251234567');
  check('phone: UAE without plus', normalizePhone_('971 50 123 4567', '63'), '+971501234567');
  check('phone: Brunei without plus', normalizePhone_('673 712 3456', '63'), '+6737123456');
  check('phone: UK with plus', normalizePhone_('+44 20 7946 0018', '63'), '+442079460018');
  // The trap: a local mobile without its 0 starts with 91, which is India.
  check('phone: local mobile is never read as India',
    normalizePhone_('9171234567', '63'), '+639171234567');
  check('phone: short local landline is never read as Japan',
    normalizePhone_('8123 4567', '63'), '+6381234567');

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
  check('date: month-first is certain when the day is over 12',
    classifyDate_('03/15/2027').status + ' ' + classifyDate_('03/15/2027').value, 'iso 2027-03-15');
  check('date: day-first is certain when the day is over 12',
    classifyDate_('15/03/2027').status + ' ' + classifyDate_('15/03/2027').value, 'iso 2027-03-15');
  check('date: both under 12 is ambiguous', classifyDate_('03/04/2027').status, 'ambiguous');
  check('date: same day and month reads the same either way',
    classifyDate_('06/06/2027').status + ' ' + classifyDate_('06/06/2027').value, 'iso 2027-06-06');
  check('date: ambiguous yields no value', classifyDate_('03/04/2027').value, '');
  check('date: ISO is certain', classifyDate_('2027-03-15').status, 'iso');
  check('date: a month name settles it', classifyDate_('March 15, 2027').status, 'iso');
  check('date: prose is unreadable', classifyDate_('sometime next year').status, 'unreadable');
  check('date: original always preserved', classifyDate_('03/04/2027').original, '03/04/2027');

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
  check('route: but the combined form option is a wedding',
    resolveEventType_('Wedding/Wedding Anniversary').tab, 'Wedding');
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
  check('map: shouted header stops shouting', humanizeKey_('SALES NOTES'), 'Sales Notes');
  check('map: deliberate mixed case left alone', humanizeKey_('Preferred VIP Room'), 'Preferred VIP Room');

  check('webhook: the /dev URL is the test one',
    isTestWebhookUrl_('https://script.google.com/macros/s/ABC/dev'), 'true');
  check('webhook: the /exec URL is the live one',
    isTestWebhookUrl_('https://script.google.com/macros/s/ABC/exec'), 'false');
  check('webhook: /dev with a query string is still the test one',
    isTestWebhookUrl_('https://script.google.com/macros/s/ABC/dev?source=website'), 'true');

  check('url: a clean exec address is accepted',
    checkWebAppUrl_('https://script.google.com/macros/s/AKfy123/exec').ok, 'true');
  check('url: the dev address is refused',
    checkWebAppUrl_('https://script.google.com/macros/s/AKfy123/dev').ok, 'false');
  check('url: an address with a query string is refused',
    checkWebAppUrl_('https://script.google.com/macros/s/AKfy123/exec?source=website').ok, 'false');
  check('url: but the good part is kept',
    checkWebAppUrl_('https://script.google.com/macros/s/AKfy123/exec?token=x').url,
    'https://script.google.com/macros/s/AKfy123/exec');
  check('url: a second URL pasted as the token is refused',
    checkWebAppUrl_('https://script.google.com/macros/s/A/exec?token=https%3A%2F%2Fscript.google.com').ok,
    'false');
  check('url: something that is not apps script is refused',
    checkWebAppUrl_('https://example.com/hook').ok, 'false');
  check('url: surrounding quotes are tolerated',
    checkWebAppUrl_('"https://script.google.com/macros/s/AKfy123/exec"').ok, 'true');

  // --- Wix form fields, as they actually arrive ----------------------------
  // Wix names every field "field:<slug>" and sends its own bookkeeping
  // alongside. These are real field names from a live site.
  check('wix: full name', matchField_('field:full_name').field, 'fullName');
  check('wix: your name', matchField_('field:your_name').field, 'fullName');
  check('wix: misspelled email still matches', matchField_('field:email_adress').field, 'email');
  check('wix: contact number', matchField_('field:contact_number').field, 'phone');
  check('wix: event type', matchField_('field:event_type').field, 'eventType');
  check('wix: type of celebration', matchField_('field:type_of_celebration').field, 'eventType');
  check('wix: whats the occasion', matchField_('field:whats_the_occasion').field, 'eventType');
  check('wix: when is the event is a date, not a type',
    matchField_('field:when_is_the_event_1').field, 'eventDate');
  check('wix: when is your event is a date too',
    matchField_('field:when_is_your_event').field, 'eventDate');
  check('wix: target date of event', matchField_('field:target_date_of_event').field, 'eventDate');
  check('wix: estimated guest count', matchField_('field:estimated_guest_count').field, 'guestCount');
  check('wix: estimated number of guests',
    matchField_('field:estimated_number_of_guests').field, 'guestCount');
  check('wix: which venue is a venue, not an event type',
    matchField_('field:which_venue_are_you_interested_in').field, 'venue');
  check('wix: target location venue', matchField_('field:target_location_venue').field, 'venue');
  check('wix: budget range', matchField_('field:budget_range').field, 'budget');
  check('wix: company name', matchField_('field:company_name_49ed').field, 'company');
  check('wix: form name becomes the sub-source', matchField_('formName').field, 'subSource');
  check('wix: submission time is when it arrived',
    matchField_('submissionTime').field, 'receivedAt');

  // Our own staff member, not the client — this must never become the lead's name.
  check('wix: hizons contact person is not the client',
    matchField_('field:contact_person_from_hizons_catering').field, 'message');

  // A UUID must never be read as a phone number just because it says "contact".
  check('wix: contact id ignored', isNoiseKey_('contactId'), 'true');
  check('wix: contact identity type ignored', isNoiseKey_('contactIdentityType'), 'true');
  check('wix: submissions link ignored', isNoiseKey_('submissionsLink'), 'true');
  check('wix: checkbox placeholder ignored', isNoiseKey_('field:form_field_20db'), 'true');
  check('wix: form id ignored', isNoiseKey_('formId'), 'true');
  check('wix: field prefix stripped from the label',
    humanizeKey_('field:anything_else_we_should_know'), 'Anything Else We Should Know');

  // A real name field beats a lookalike when both could claim the same slot.
  const wixRecord = mapRecord_({
    'field:full_name': 'Maria Santos',
    'field:contact_person_from_hizons_catering': 'Bea',
    'field:contact_number': '0917 123 4567',
    'contactId': 'edca2245-7ce3-4d95-bfe9-b2012110eb8f'
  });
  check('wix: the client is the client', wixRecord.fields.fullName, 'Maria Santos');
  check('wix: the phone is a phone', wixRecord.fields.phone, '0917 123 4567');
  check('wix: our own contact is kept as a note',
    wixRecord.messages.some(function (m) { return m.value === 'Bea'; }), 'true');

  check('wix: the builder default name is spotted', looksLikeDefaultFormName_('My form'), 'true');
  check('wix: so is Form 1', looksLikeDefaultFormName_('Form 1'), 'true');
  check('wix: a real form name is not', looksLikeDefaultFormName_('Homepage Inquiry'), 'false');

  check('placeholder: a token standing in for its own answer',
    isPlaceholderValue_('field:full_name', 'field:full_name'), 'true');
  check('placeholder: any unfilled field token',
    isPlaceholderValue_('anything', 'field:contact_number'), 'true');
  check('placeholder: unsubstituted handlebars',
    isPlaceholderValue_('Name', '{{contact.name}}'), 'true');
  check('placeholder: a real answer is not one',
    isPlaceholderValue_('field:full_name', 'Maria Santos'), 'false');
  const unfilled = mapRecord_({
    'field:full_name': 'field:full_name',
    'field:email_adress': 'field:email_adress'
  });
  check('placeholder: nothing is taken from an unfilled form',
    Object.keys(unfilled.fields).length, 0);
  check('placeholder: and it is counted so the reason can say so',
    unfilled.placeholders, 2);

  // --- The shape Wix actually posts ----------------------------------------
  // Answers arrive as {label, value} pairs inside a submissions array. Read
  // naively the label and the answer become two unrelated entries and the
  // field is never recognised at all.
  const wixPayload = flatten_({
    formName: 'INSTAQUOTE',
    submissions: [
      { id: 'a1', label: 'First name', value: 'Jaime' },
      { id: 'a2', label: 'Contact number', value: '0955 589 6692' }
    ],
    contact: { jobTitle: 'CEO', addressLine: '123 Main Street', country: 'US' },
    submissionPdf: { fileName: 'x.pdf', downloadUrl: 'https://static.wixstatic.com/x.gif' }
  });
  check('wix: an answer is paired with its label', wixPayload['First name'], 'Jaime');
  check('wix: and so is the next one', wixPayload['Contact number'], '0955 589 6692');
  check('wix: the label is not left stranded', wixPayload['submissions.0.label'], 'undefined');

  const wixMapped = mapRecord_(wixPayload);
  check('wix: the paired answer reaches its field', wixMapped.fields.firstName, 'Jaime');
  check('wix: and the phone reaches its own', wixMapped.fields.phone, '0955 589 6692');
  check('wix: the contact record does not reach the notes',
    wixMapped.extras.some(function (e) { return e.value === 'CEO' || e.value === 'US'; }), 'false');
  check('wix: nor does the attached pdf',
    wixMapped.extras.some(function (e) { return /wixstatic/.test(e.value); }), 'false');

  check('wix: an object that is not a pair is left alone',
    JSON.stringify(flatten_({ contact: { label: 'x' } })), '{"contact.label":"x"}');
  check('wix: a value that is itself an object is not paired',
    JSON.stringify(flatten_({ a: { label: 'x', value: { deep: 1 } } })),
    '{"a.label":"x","a.value.deep":1}');

  // --- Columns competing for one destination -------------------------------
  const notesRecord = mapRecord_({
    'Full name': 'Rosa Lim',
    'Contact number': '0917 123 4567',
    'CONTACT METHOD': 'Viber please',
    'SALES NOTES': 'Called twice, no answer',
    'CLIENT NOTES': 'Wants a garden setup',
    'CONSO DATE': '2026-01-04',
    'PRESENTER': 'Pam',
    'BOOTH STAFF': 'Iris'
  });
  check('notes: contact method is free text, not a phone', matchField_('CONTACT METHOD').field, 'message');
  check('notes: phone column still wins the phone slot', notesRecord.fields.phone, '0917 123 4567');
  check('notes: every notes column kept', notesRecord.messages.length, 3);
  check('notes: sales notes survived',
    notesRecord.messages.some(function (m) { return m.value === 'Called twice, no answer'; }), 'true');
  check('notes: client notes survived',
    notesRecord.messages.some(function (m) { return m.value === 'Wants a garden setup'; }), 'true');
  check('notes: labelled by their own headers', notesRecord.messages[0].label.length > 0, 'true');
  check('conso date is dropped, not filed as an event date', isNoiseKey_('CONSO DATE'), 'true');
  check('presenter gets its own column, not the notes', notesRecord.fields.presenter, 'Pam');
  check('unknown column still reaches the notes',
    notesRecord.extras.some(function (e) { return e.value === 'Iris'; }), 'true');

  check('settings: a deliberate zero is not read as "unset"',
    numberSetting_('No Such Setting At All', 240), 240);

  // --- The presenter sequence ----------------------------------------------
  check('presenter: first row', presenterFor_('Wedding', 2, 'Bea'), 'AJ');
  check('presenter: second row', presenterFor_('Wedding', 3, 'Bea'), 'Pam');
  check('presenter: third row', presenterFor_('Debut', 4, 'Bea'), 'Mhay');
  check('presenter: fourth row', presenterFor_("Kid's Party", 5, 'Bea'), 'Vanessa');
  check('presenter: sequence repeats', presenterFor_('Private Event', 6, 'Bea'), 'AJ');
  check('presenter: still repeating far down', presenterFor_('Wedding', 42, 'Bea'), 'AJ');
  check('presenter: and off the cycle boundary', presenterFor_('Wedding', 45, 'Bea'), 'Vanessa');
  check('presenter: header row has none', presenterFor_('Wedding', 1, 'Bea'), '');

  const twoPhones = mapRecord_({
    'Contact No.': '0917 111 1111',
    'Contact No. (2)': '0918 222 2222'
  });
  check('two phone columns: first wins the column', twoPhones.fields.phone, '0917 111 1111');
  check('two phone columns: second is not lost', twoPhones.extras.length, 1);

  check('a single notes column reads as plain text',
    composeMessage_([{ label: 'Message', value: 'Just the one' }], []), 'Just the one');
  check('several notes columns get labelled',
    composeMessage_([
      { label: 'Sales Notes', value: 'Called twice' },
      { label: 'Client Notes', value: 'Garden setup' }
    ], []),
    'Sales Notes: Called twice\nClient Notes: Garden setup');
  check('unmatched columns follow the notes',
    composeMessage_([{ label: 'Message', value: 'Hello' }], [{ label: 'Presenter', value: 'Iris' }]),
    'Hello\nPresenter: Iris');

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
  const roster = rosterReport_();

  let summary = failures.length
    ? failures.length + ' of ' + results.length + ' checks FAILED.'
    : 'All ' + results.length + ' checks passed.';
  const problems = roster.filter(function (line) { return line.indexOf('OK') !== 0; });
  summary += problems.length
    ? '\n' + problems.length + ' thing' + (problems.length === 1 ? '' : 's') +
      ' to fix on the ' + SHEETS.team + ' tab.'
    : '';

  const detail = results.map(function (r) { return r.line; }).join('\n') +
    '\n\n--- ' + SHEETS.team + ' roster ---\n' + roster.join('\n');
  console.log(summary + '\n' + detail);
  return { summary: summary, detail: detail, failures: failures.length, roster: roster };
}

/**
 * Checks the roster for the mistakes that are invisible in the spreadsheet but
 * stop leads reaching people: an event type misspelled so nobody matches it, a
 * salesperson marked active with nothing to cover, two people pointed at one
 * tab, or an event type nobody active handles.
 *
 * Read-only. Lines that do not start with "OK" are things to fix.
 * @return {!Array<string>}
 */
function rosterReport_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.team);
  if (!sheet || sheet.getLastRow() < 2) {
    return ['No roster yet — every lead goes to the shared event-type tabs, unassigned.'];
  }

  const known = {};
  allEventTypes_().forEach(function (type) { known[squashKey_(type.label)] = type.label; });

  const members = loadTeam_();
  const active = members.filter(function (m) { return m.active; });
  const lines = [];

  members.forEach(function (member) {
    const unknown = member.eventTypes.filter(function (label) {
      return label !== '*' && !known[squashKey_(label)];
    });
    if (unknown.length) {
      lines.push('"' + member.name + '" has an event type that matches nothing: ' +
        unknown.join(', ') + '. Leads of that type will never reach them.');
    }
    if (member.active && !member.eventTypes.length) {
      lines.push('"' + member.name + '" is active but covers no event types, so gets nothing.');
    }
  });

  const tabs = {};
  active.forEach(function (member) {
    const key = squashKey_(member.tab);
    if (tabs[key]) {
      lines.push('"' + member.name + '" and "' + tabs[key] + '" both write to the "' +
        member.tab + '" tab — their leads will be mixed together.');
    } else {
      tabs[key] = member.name;
    }
  });

  EVENT_TYPES.forEach(function (type) {
    const covered = active.some(function (member) {
      return member.eventTypes.some(function (label) {
        return label === '*' || squashKey_(label) === squashKey_(type.label);
      });
    });
    if (!covered) {
      lines.push('Nobody active covers ' + type.label + ' — those leads go to the "' +
        type.tab + '" tab, unassigned.');
    }
  });

  if (!lines.length) {
    lines.push('OK — ' + active.length + ' active of ' + members.length + ' on the roster.');
    EVENT_TYPES.forEach(function (type) {
      const names = active.filter(function (member) {
        return member.eventTypes.some(function (label) {
          return label === '*' || squashKey_(label) === squashKey_(type.label);
        });
      }).map(function (member) { return member.name; });

      const rule = presenterRule_(type.label);
      const presenters = rule.mode === 'caller' ? 'presented by the caller'
        : rule.mode === 'none' ? 'no presenter'
        : 'presented by ' + rule.list.join(' → ');
      lines.push('OK — ' + type.label + ': called by ' + names.join(', ') + ', ' + presenters);
    });
  }
  return lines;
}

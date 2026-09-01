/**
 * Website Leads Automation — central configuration.
 *
 * Everything a non-developer needs to change day to day lives in the
 * _Settings and _Sources tabs of the spreadsheet, not in here. This file holds
 * the structural defaults: the column schema, the event-type routing table and
 * the field-alias dictionary used to read unfamiliar forms and fair worksheets.
 */

/** Spreadsheet tabs the automation owns. */
const SHEETS = {
  allLeads: 'All Leads',
  duplicates: 'Duplicates',
  unassigned: 'Unassigned',
  settings: '_Settings',
  team: '_Team',
  sources: '_Sources',
  index: '_Index',
  log: '_Log',
  raw: '_Raw'
};

/**
 * Canonical lead record, in column order. Team tabs and All Leads share it.
 *
 * Presenter leads the row deliberately: a tab belongs to one caller, and the
 * first thing they need to see on a lead is which presenter it goes to.
 */
const LEAD_COLUMNS = [
  'Presenter',
  'Lead ID',
  'Received At',
  'Source',
  'Sub-Source',
  'Event Type',
  'Event Type (Raw)',
  'Full Name',
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Company',
  'Event Date',
  'Event Date (Raw)',
  'Guest Count',
  'Venue / Location',
  'Budget',
  'Message',
  'Campaign',
  'Assigned To',
  'Status',
  'Touches',
  'First Seen At',
  'Last Touch At',
  'All Sub-Sources',
  'Raw Ref'
];

/**
 * The salesperson roster. Leads are routed to a person's own tab, chosen by
 * round robin among whoever covers that event type.
 */
const TEAM_COLUMNS = [
  'Salesperson',
  'Tab Name',
  'Event Types',
  'Email',
  'Active',
  'Assigned Count',
  'Last Assigned At',
  'Notes'
];

/** Extra columns only the Duplicates tab carries, appended after LEAD_COLUMNS. */
const DUPLICATE_EXTRA_COLUMNS = ['Matched On', 'Original Lead ID', 'Original Tab'];

/**
 * Event types, and the shared tab each one falls back to when nobody on the
 * _Team roster covers it.
 *
 * `keywords` are matched against whatever the form or worksheet supplied. The
 * longest matching keyword wins, so the most specific reading is used: "18th
 * birthday" is a Debut rather than a generic birthday, "kiddie party" is a
 * Kid's Party, "wedding anniversary" is a Wedding rather than a generic
 * anniversary, and "corporate anniversary" is Corporate rather than either.
 *
 * A plain "birthday" with nothing else to go on is treated as a Private Event —
 * an adult's birthday party. Move the word to another type's list if that is
 * the wrong default for your enquiries.
 *
 * Add a type by adding an entry here, then run Leads > Setup / repair tabs.
 */
const EVENT_TYPES = [
  {
    key: 'wedding',
    label: 'Wedding',
    tab: 'Wedding',
    keywords: [
      'wedding', 'bridal', 'bride', 'groom', 'engagement', 'nuptial',
      'church wedding', 'civil wedding', 'garden wedding', 'destination wedding',
      'prenup', 'pre-nup', 'wedding reception', 'kasal', 'renewal of vows',
      'wedding anniversary', 'wedding anniversary party'
    ]
  },
  {
    key: 'debut',
    label: 'Debut',
    tab: 'Debut',
    keywords: [
      'debut', 'debutante', 'cotillion', '18th birthday', '18th bday',
      '18th bday party', 'eighteenth birthday', '18 birthday', 'sweet 16',
      '16th birthday'
    ]
  },
  {
    key: 'kids',
    label: "Kid's Party",
    tab: "Kid's Party",
    keywords: [
      'kiddie party', 'kids party', "kid's party", 'kids birthday',
      "children's party", 'childrens party', 'children party', 'kiddie',
      '1st birthday', 'first birthday', '7th birthday',
      'baby shower', 'gender reveal', 'kids event'
    ]
  },
  {
    key: 'private',
    label: 'Private Event',
    tab: 'Private Event',
    keywords: [
      'private', 'private event', 'intimate', 'intimate gathering',
      'family gathering', 'dinner party', 'house party', 'get together',
      'get-together', 'small gathering', 'birthday', 'bday', 'anniversary',
      'reunion', 'graduation', 'despedida', 'homecoming', 'retirement',
      'thanksgiving', 'funeral', 'memorial', 'wake',
      // A baptism is sold as a private event here, not as a kiddie party.
      // "baptism" and "binyag" are substrings of "baptismal" and "binyagan",
      // so those arrive here too.
      'christening', 'baptism', 'binyag'
    ]
  },
  {
    key: 'corporate',
    label: 'Corporate',
    tab: 'Corporate',
    keywords: [
      'corporate', 'company', 'business', 'conference', 'seminar', 'convention',
      'meeting', 'team building', 'teambuilding', 'product launch', 'launch',
      'gala', 'awards night', 'awarding', 'christmas party', 'year end party',
      'general assembly', 'training', 'workshop', 'summit', 'expo',
      'grand opening', 'ribbon cutting', 'groundbreaking', 'inauguration',
      'corporate anniversary', 'company anniversary', 'annual meeting',
      'stockholders meeting', 'client appreciation'
    ]
  }
];

/** Where leads land when the event type is missing or unrecognised. */
const FALLBACK_EVENT_TYPE = {
  key: 'unassigned',
  label: 'Unassigned',
  tab: SHEETS.unassigned,
  keywords: []
};

/** The three lead sources, tagged on every row. */
const SOURCES = {
  website: 'Website',
  googleAds: 'Google Ads',
  exhibit: 'Exhibit'
};

/** Defaults, overridable per-key from the _Settings tab. */
const DEFAULT_SETTINGS = {
  'Time Zone': 'Asia/Manila',
  'Default Country Code': '63',
  'Local Mobile Prefix': '9',
  'Dedupe On': 'email,phone',
  'Dedupe Ignore Plus Tags': 'yes',
  'Promote Unassigned Leads': 'yes',
  'Append Duplicate Notes': 'yes',
  'Normalise Event Dates On Import': 'yes',
  'Import Time Budget (seconds)': '240',
  'Accept Test Leads': 'no',
  'Round Robin Assignment': 'yes',
  'Presenters': 'AJ, Pam, Mhay, Vanessa',
  'Notify On New Lead': 'no',
  'Notify Every N Leads': '5',
  'Notify Unassigned To': '',
  'Digest Every N Leads': '10',
  'Digest Recipients': '',
  'Raw Payload Retention (rows)': '2000',
  'Log Retention (rows)': '5000'
};

/**
 * Canonical field <- possible header / key names.
 *
 * Comparison is done on a squashed key (lowercase, letters and digits only),
 * so "Contact No.", "contact_no" and "CONTACT NO" all collapse to "contactno".
 * Google Ads column ids (FULL_NAME, PHONE_NUMBER, ...) collapse the same way.
 */
const FIELD_ALIASES = {
  fullName: [
    'name', 'full name', 'fullname', 'complete name', 'client name',
    'contact person', 'contact name', 'lead name', 'guest name', 'your name',
    'customer name', 'pangalan'
  ],
  firstName: ['first name', 'firstname', 'fname', 'given name', 'first'],
  lastName: ['last name', 'lastname', 'lname', 'surname', 'family name', 'last'],
  email: [
    'email', 'e mail', 'email address', 'emailaddress', 'e mail address',
    'work email', 'business email', 'contact email'
  ],
  phone: [
    'phone', 'phone number', 'mobile', 'mobile number', 'mobile no',
    'contact number', 'contact no', 'contact', 'cell', 'cellphone',
    'cell number', 'telephone', 'tel', 'tel no', 'work phone', 'viber',
    'viber number', 'whatsapp', 'number'
  ],
  company: [
    'company', 'company name', 'organization', 'organisation',
    'organization name', 'business name', 'employer', 'job title'
  ],
  eventType: [
    'event type', 'type of event', 'event', 'occasion', 'celebration',
    'inquiry type', 'type of inquiry', 'event category', 'category',
    'package type', 'service', 'service needed', 'interested in',
    'what is the occasion', 'nature of event'
  ],
  eventDate: [
    'event date', 'date of event', 'preferred date', 'target date',
    'when is the event', 'when is your event', 'date of celebration',
    'wedding date', 'date of wedding', 'affair date', 'date of affair',
    'celebration date', 'party date', 'debut date', 'reception date',
    'tentative date', 'date', 'schedule', 'when is your event',
    'date of your event', 'date of the event', 'what date',
    'when', 'proposed date', 'function date'
  ],
  guestCount: [
    'guest count', 'guests', 'number of guests', 'no of guests', 'pax',
    'headcount', 'head count', 'estimated guests', 'estimated pax',
    'expected guests', 'how many guests', 'number of pax'
  ],
  venue: [
    'venue', 'location', 'preferred venue', 'preferred location', 'place',
    'which venue', 'venue are you interested in', 'venue of choice',
    'target location', 'location venue',
    'area', 'city', 'address', 'event location', 'event venue', 'branch'
  ],
  budget: [
    'budget', 'budget range', 'estimated budget', 'price range',
    'budget per head', 'budget per pax', 'target budget'
  ],
  presenter: [
    'presenter', 'presentor', 'presented by', 'assigned presenter',
    'presenter assigned', 'endorsed to'
  ],
  message: [
    'message', 'notes', 'note', 'remarks', 'comments', 'comment', 'inquiry',
    'sales notes', 'client notes', 'internal notes', 'contact method',
    'preferred contact method', 'preferred contact', 'contact preference',
    'mode of contact', 'how to contact', 'best time to call',
    'follow up method', 'preferred follow up method',
    // Who at Hizon's the client has already spoken to — not the client's own
    // name, which is what "contact person" would otherwise be read as.
    'contact person from hizons catering', 'contact person from hizons',
    'inquiry details', 'details', 'additional info', 'additional information',
    'question', 'questions', 'how can we help', 'tell us more', 'other details',
    'requirements', 'special requests'
  ],
  campaign: [
    'campaign', 'campaign id', 'campaign name', 'utm campaign', 'ad group',
    'adgroup id', 'creative id', 'source campaign', 'ad'
  ],
  subSource: [
    'sub source', 'subsource', 'form', 'form name', 'formname', 'form id',
    'form title', 'source form', 'fair', 'fair name', 'event name', 'exhibit'
  ],
  source: ['source', 'lead source', 'channel'],
  receivedAt: [
    'received at', 'timestamp', 'date submitted', 'submitted at', 'submission date',
    'submission time', 'submitted on',
    'date received', 'created at', 'date and time'
  ],
  assignedTo: ['assigned to', 'owner', 'sales rep', 'account executive', 'ae', 'handler'],
  status: ['status', 'lead status', 'stage']
};

/**
 * Last-resort matching for headers no alias covers. Applied only when nothing
 * else matched, so "Wedding Date" and "Anniversary Date" find the event date
 * column while "Date Received" still matches its own alias first.
 */
const FIELD_SUFFIX_RULES = [
  { suffix: 'date', field: 'eventDate' },
  { suffix: 'email', field: 'email' },
  { suffix: 'emailaddress', field: 'email' }
];

/**
 * Calling codes recognised on a number typed without a leading + or 00.
 *
 * A guest who writes "65 9123 4567" means Singapore, not a Philippine number
 * with a stray 65 on the front. Longest codes are tried first so 852 beats 85.
 * Add a code here if enquiries start arriving from somewhere new.
 */
const INTERNATIONAL_DIAL_CODES = [
  // North America
  '1',
  // Europe
  '7', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45',
  '46', '47', '48', '49', '351', '353', '354', '356', '357', '358', '359',
  '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381',
  '385', '386', '420', '421', '423',
  // Latin America
  '51', '52', '53', '54', '55', '56', '57', '58', '502', '503', '504', '505',
  '506', '507', '509', '591', '593', '595', '598',
  // Asia Pacific
  '60', '61', '62', '64', '65', '66', '81', '82', '84', '86', '91', '92', '93',
  '94', '95', '673', '675', '676', '677', '679', '680', '685', '850', '852',
  '853', '855', '856', '880', '886', '960', '975', '976', '977', '992', '993',
  '994', '995', '996', '998',
  // Middle East
  '90', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971',
  '972', '973', '974',
  // Africa
  '20', '27', '211', '212', '213', '216', '218', '220', '221', '223', '225',
  '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236',
  '237', '238', '239', '240', '241', '242', '243', '244', '245', '248', '249',
  '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261',
  '262', '263', '264', '265', '266', '267', '268', '269'
];

/**
 * Answers that mean "nothing to tell you": a blank by another name.
 *
 * Compared after squashKey_(), so "N/A", "n.a." and "NA" are one entry.
 */
const NON_ANSWERS = [
  'na', 'nan', 'none', 'nil', 'null', 'nothing', 'blank', 'empty',
  'tbd', 'tba', 'tbc', 'notyet', 'notsure', 'unsure', 'undecided', 'unknown',
  'notapplicable', 'notavailable', 'noneyet', 'wala',
  'true', 'false', 'yes', 'no'
];

/** Keys carried by a Google Ads lead-form webhook payload. */
const GOOGLE_ADS_MARKERS = ['user_column_data', 'google_key', 'lead_id'];

/**
 * Keys dropped entirely: webhook plumbing, and internal columns the sales team
 * has asked not to carry over. Everything else that matches no field is kept
 * in the Message column rather than discarded.
 */
const NOISE_KEYS = [
  'conso date',
  'google key', 'api version', 'is test', 'gcl id', 'lead id', 'form id',
  'submission id', 'recaptcha', 'captcha', 'token', 'ip address', 'user agent',
  'consent', 'terms', 'privacy policy', 'submit', 'g recaptcha response',
  // Wix bookkeeping. "contact id" matters: it is a UUID, and without this it
  // reads as a phone number because it contains "contact".
  'contact id', 'contact identity', 'submissions link', 'submission pdf',
  'form field mask', 'form field', 'form revision', 'namespace',
  // Google Ads bookkeeping. "phone number verified" matters: it carries
  // TRUE/FALSE and outscores "user phone" for the Phone column.
  'phone number verified', 'email verified', 'lead stage'
];

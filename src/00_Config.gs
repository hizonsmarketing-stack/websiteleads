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
  'Phone (Raw)',
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
 * Kid's Party, "corporate anniversary" is Corporate rather than an anniversary.
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
      'wedding anniversary party'
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
      '1st birthday', 'first birthday', '7th birthday', 'christening',
      'baptism', 'binyag', 'baby shower', 'gender reveal', 'kids event'
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
      'thanksgiving', 'funeral', 'memorial', 'wake'
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
  'Dedupe On': 'email,phone',
  'Dedupe Ignore Plus Tags': 'yes',
  'Promote Unassigned Leads': 'yes',
  'Append Duplicate Notes': 'yes',
  'Accept Test Leads': 'no',
  'Round Robin Assignment': 'yes',
  'Presenters': 'AJ, Pam, Mhay, Vanessa',
  'Notify On New Lead': 'no',
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
    'wedding date', 'date of wedding', 'affair date', 'date of affair',
    'celebration date', 'party date', 'debut date', 'reception date',
    'tentative date', 'date', 'schedule', 'when is your event',
    'when', 'proposed date', 'function date'
  ],
  guestCount: [
    'guest count', 'guests', 'number of guests', 'no of guests', 'pax',
    'headcount', 'head count', 'estimated guests', 'estimated pax',
    'expected guests', 'how many guests', 'number of pax'
  ],
  venue: [
    'venue', 'location', 'preferred venue', 'preferred location', 'place',
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
  'consent', 'terms', 'privacy policy', 'submit', 'g recaptcha response'
];

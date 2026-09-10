/**
 * Credentials, and what the agent can still do without each of them.
 *
 * Nothing throws on a missing secret. A run with no credentials at all is a
 * valid run — it uses fixtures and says so, which is what makes `npm run
 * agent -- --offline` a useful thing to type before you have signed up for
 * anything.
 */

/** Reads a variable, treating whitespace-only as absent. */
function read(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value === '' ? null : value;
}

/**
 * Service-account JSON arrives base64-encoded, because a PEM private key with
 * literal newlines does not survive being pasted into a GitHub secret intact.
 * A raw JSON blob is accepted too, for running locally.
 */
function readServiceAccount(name) {
  const raw = read(name);
  if (!raw) return null;
  let text = raw;
  if (!raw.startsWith('{')) {
    try {
      text = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      return { error: `${name} is neither JSON nor valid base64` };
    }
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed.client_email || !parsed.private_key) {
      return { error: `${name} is missing client_email or private_key` };
    }
    return parsed;
  } catch {
    return { error: `${name} did not parse as JSON` };
  }
}

export function loadEnv(source = process.env) {
  const prior = process.env;
  process.env = source;
  try {
    const serviceAccount = readServiceAccount('GOOGLE_SERVICE_ACCOUNT_JSON');
    return {
      semrush: {
        key: read('SEMRUSH_API_KEY'),
        database: read('SEMRUSH_DATABASE'),
      },
      wix: {
        apiKey: read('WIX_API_KEY'),
        siteId: read('WIX_SITE_ID'),
        accountId: read('WIX_ACCOUNT_ID'),
      },
      google: {
        serviceAccount: serviceAccount && !serviceAccount.error ? serviceAccount : null,
        serviceAccountError: serviceAccount && serviceAccount.error ? serviceAccount.error : null,
        ga4PropertyId: read('GA4_PROPERTY_ID'),
        searchConsoleSite: read('SEARCH_CONSOLE_SITE'),
        leadsSpreadsheetId: read('LEADS_SPREADSHEET_ID'),
      },
      claude: {
        apiKey: read('ANTHROPIC_API_KEY'),
        model: read('ANTHROPIC_MODEL') || 'claude-opus-5',
      },
      domain: read('SITE_DOMAIN'),
    };
  } finally {
    process.env = prior;
  }
}

/**
 * A human-readable account of which sources are live, for the run log and for
 * the dashboard's provenance footer. A recommendation built on two sources
 * deserves less trust than one built on five, and the reader should be able to
 * see which they are looking at.
 */
export function describeSources(env) {
  const google = env.google.serviceAccount;
  return [
    { id: 'semrush', label: 'Semrush', ready: Boolean(env.semrush.key), missing: 'SEMRUSH_API_KEY' },
    {
      id: 'wix',
      label: 'Wix analytics',
      ready: Boolean(env.wix.apiKey && env.wix.siteId),
      missing: 'WIX_API_KEY + WIX_SITE_ID',
    },
    {
      id: 'gsc',
      label: 'Search Console',
      ready: Boolean(google && env.google.searchConsoleSite),
      missing: 'GOOGLE_SERVICE_ACCOUNT_JSON + SEARCH_CONSOLE_SITE',
    },
    {
      id: 'ga4',
      label: 'Google Analytics 4',
      ready: Boolean(google && env.google.ga4PropertyId),
      missing: 'GOOGLE_SERVICE_ACCOUNT_JSON + GA4_PROPERTY_ID',
    },
    {
      id: 'leads',
      label: 'Lead sheet',
      ready: Boolean(google && env.google.leadsSpreadsheetId),
      missing: 'GOOGLE_SERVICE_ACCOUNT_JSON + LEADS_SPREADSHEET_ID',
      optional: true,
    },
    { id: 'claude', label: 'Claude', ready: Boolean(env.claude.apiKey), missing: 'ANTHROPIC_API_KEY' },
  ];
}

/**
 * The webhook endpoint. One deployed URL serves every on-page Wix form and
 * every Google Ads lead form; the query string says which is which.
 *
 *   .../exec?token=SECRET&source=website&form=Homepage%20Inquiry
 *   .../exec?source=googleads            (Google Ads sends its own google_key)
 *
 * Adding a new website form is a matter of pointing it at this URL with a new
 * &form= value — no code change, no redeploy.
 */

/**
 * Handles an inbound lead submission.
 * @param {!GoogleAppsScript.Events.DoPost} e
 * @return {!GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const params = (e && e.parameter) || {};
    const isGoogleAds = looksLikeGoogleAds_(payload);

    const auth = authorize_(params, payload, isGoogleAds);
    if (!auth.ok) {
      log_('WARN', 'webhook', 'Rejected unauthorised request', { reason: auth.reason });
      return jsonResponse_({ status: 'error', message: auth.reason });
    }

    if (isGoogleAds && payload.is_test && !settingIsOn_('Accept Test Leads')) {
      log_('INFO', 'webhook', 'Google Ads test lead acknowledged and not stored', {
        formId: payload.form_id
      });
      return jsonResponse_({ status: 'ok', message: 'test lead acknowledged' });
    }

    const source = resolveSource_(params, isGoogleAds);
    const subSource = resolveWebhookSubSource_(params, payload, isGoogleAds);
    const flat = isGoogleAds ? flattenGoogleAds_(payload) : flatten_(payload);
    if (!Object.keys(flat).length) {
      return jsonResponse_({ status: 'error', message: 'empty payload' });
    }

    const rawRef = storeRaw_(source, subSource, payload);
    const summary = intakeBatch_([{
      flat: flat,
      source: source,
      subSource: subSource,
      rawRef: rawRef,
      // Google Ads retries a delivery it does not get a prompt 200 for, and
      // the retry carries the same lead_id. Passing it through is what makes
      // the second delivery merge instead of becoming a second lead.
      externalId: isGoogleAds ? cleanText_(payload.lead_id) : ''
    }], 'webhook');

    const result = summary.results[0];
    return jsonResponse_({
      status: 'ok',
      action: result.action,
      leadId: result.leadId,
      eventType: result.eventType,
      tab: result.tab
    });
  } catch (err) {
    log_('ERROR', 'webhook', 'Unhandled failure', { error: String(err && err.stack || err) });
    // 200 with an error body: form tools retry aggressively on non-200, and a
    // retry storm would be worse than one logged failure we can replay from _Raw.
    return jsonResponse_({ status: 'error', message: String(err && err.message || err) });
  }
}

/**
 * Health check. Visiting the deployed URL in a browser confirms the deployment
 * is live without creating anything.
 * @param {!GoogleAppsScript.Events.DoGet} e
 * @return {!GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  return jsonResponse_({
    status: 'ok',
    service: 'Website Leads Automation',
    build: buildStamp_(),
    assignmentOrder: setting_('Assignment Order', 'balanced'),
    time: nowStamp_(),
    tabs: leadTabNames_()
  });
}

/** @return {!GoogleAppsScript.Content.TextOutput} */
function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Reads the request body as JSON, falling back to form-encoded parameters.
 * @param {!GoogleAppsScript.Events.DoPost} e
 * @return {!Object}
 */
function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    const contents = e.postData.contents;
    try {
      const parsed = JSON.parse(contents);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (err) {
      // Not JSON — fall through to the parsed form parameters below.
    }
  }
  const params = Object.assign({}, (e && e.parameter) || {});
  delete params.token;
  delete params.source;
  delete params.form;
  return params;
}

/** @return {boolean} True when the payload is a Google Ads lead form webhook. */
function looksLikeGoogleAds_(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return GOOGLE_ADS_MARKERS.some(function (marker) {
    return Object.prototype.hasOwnProperty.call(payload, marker);
  });
}

/**
 * Verifies the caller.
 *
 * Google Ads authenticates with the `google_key` you set on the lead form;
 * everything else uses a shared token on the query string. When the matching
 * script property is not set the request is allowed and a warning is logged,
 * so a new form can be tested before the secret is in place.
 *
 * @return {{ok: boolean, reason: string}}
 */
function authorize_(params, payload, isGoogleAds) {
  const props = PropertiesService.getScriptProperties();

  if (isGoogleAds) {
    const expected = props.getProperty('GOOGLE_ADS_KEY');
    if (!expected) {
      log_('WARN', 'webhook', 'GOOGLE_ADS_KEY is not set — accepting unverified Google Ads lead');
      return { ok: true, reason: '' };
    }
    return payload.google_key === expected
      ? { ok: true, reason: '' }
      : { ok: false, reason: 'invalid google_key' };
  }

  const expected = props.getProperty('WEBHOOK_TOKEN');
  if (!expected) {
    log_('WARN', 'webhook', 'WEBHOOK_TOKEN is not set — accepting unverified request');
    return { ok: true, reason: '' };
  }
  const supplied = params.token || params.key || (payload && payload.token) || '';
  return supplied === expected
    ? { ok: true, reason: '' }
    : { ok: false, reason: 'invalid token' };
}

/** @return {string} One of SOURCES. */
function resolveSource_(params, isGoogleAds) {
  const requested = squashKey_(params.source || '');
  if (requested === 'googleads' || requested === 'ads') return SOURCES.googleAds;
  if (requested === 'exhibit' || requested === 'fair' || requested === 'bridalfair') return SOURCES.exhibit;
  if (requested === 'website' || requested === 'wix' || requested === 'web') return SOURCES.website;
  return isGoogleAds ? SOURCES.googleAds : SOURCES.website;
}

/**
 * Works out the sub-source: the explicit &form= parameter wins, then any
 * form-name field in the payload, then a per-source default.
 * @return {string}
 */
function resolveWebhookSubSource_(params, payload, isGoogleAds) {
  const explicit = cleanText_(params.form || params.subsource || params.sub_source);
  if (explicit) return explicit;

  if (isGoogleAds) {
    const formId = payload.form_id || payload.formId;
    return formId ? 'Google Ads Form ' + formId : 'Google Ads Lead Form';
  }

  const flat = flatten_(payload);
  const found = Object.keys(flat).filter(function (path) {
    return matchField_(leafKey_(path)).field === 'subSource' && cleanText_(flat[path]);
  })[0];
  if (found) {
    const value = cleanText_(flat[found]);
    // A bare id makes a poor label on a sales tab; say what it is.
    return /^\d+$/.test(value) ? 'Form ' + value : value;
  }
  return 'Website Form';
}

/**
 * Converts a Google Ads lead-form payload into flat key/value pairs.
 * Custom questions arrive with the question text as the column id, so they map
 * through the same alias dictionary as any other form.
 * @param {!Object} payload
 * @return {!Object<string,*>}
 */
function flattenGoogleAds_(payload) {
  const flat = {};
  (payload.user_column_data || []).forEach(function (column) {
    const label = column.column_name || column.column_id || '';
    const value = column.string_value !== undefined ? column.string_value : column.value;
    if (label && value !== undefined && value !== null && value !== '') flat[label] = value;
  });
  if (payload.campaign_id) flat['campaign_id'] = payload.campaign_id;
  if (payload.gcl_id) flat['gclid'] = payload.gcl_id;
  return flat;
}

/**
 * The web-app URL as this execution sees it, or '' when there is none.
 *
 * Careful: run from a menu, this returns the /dev URL, which is the test
 * endpoint and only answers the logged-in editor. Anything else — Wix, Google
 * Ads, a browser in another profile — gets a 404 from it. The live URL ends in
 * /exec and carries the deployment id rather than the script id, so it cannot
 * be derived from this one; it has to come from Manage deployments.
 *
 * @return {string}
 */
function getWebhookUrl() {
  const stored = cleanText_(
    PropertiesService.getScriptProperties().getProperty('WEB_APP_URL'));
  if (stored) return stored;
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

/**
 * Checks a pasted web-app URL before it is stored.
 *
 * Assembling this by hand goes wrong in ways that are invisible afterwards —
 * a second URL pasted where the token belongs, a placeholder left in, the
 * test endpoint instead of the live one — so each is named here rather than
 * left to a 404 to explain.
 *
 * @param {string} url
 * @return {{ok: boolean, url: string, problem: string}}
 */
function checkWebAppUrl_(url) {
  const text = cleanText_(url).replace(/^[<"']+|[>"']+$/g, '');

  if (!text) return { ok: false, url: '', problem: 'Nothing was entered.' };

  if (text.indexOf('/macros/') === -1 || text.indexOf('script.google.com') === -1) {
    return { ok: false, url: text, problem:
      'That is not an Apps Script web app URL. It should look like ' +
      'https://script.google.com/macros/s/AKfy…/exec' };
  }

  const base = text.split('?')[0];
  if (isTestWebhookUrl_(base)) {
    return { ok: false, url: text, problem:
      'That is the /dev test URL, which only answers you. Copy the one from ' +
      'Deploy > Manage deployments — it ends in /exec.' };
  }
  if (!/\/exec$/.test(base)) {
    return { ok: false, url: text, problem:
      'The address must end in /exec. Copy the Web app URL from ' +
      'Deploy > Manage deployments.' };
  }

  // A query string here means the URL was assembled by hand, which is exactly
  // what this is replacing — and it is where a second URL usually ends up.
  if (text.indexOf('?') !== -1) {
    return { ok: false, url: base, problem:
      'Paste only the address itself, with nothing after /exec. The rest is ' +
      'added for you.' };
  }

  return { ok: true, url: base, problem: '' };
}

/** @return {boolean} True for the /dev test URL, which outsiders cannot reach. */
function isTestWebhookUrl_(url) {
  return /\/dev(\?|$)/.test(String(url || ''));
}

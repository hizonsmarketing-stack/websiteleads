/**
 * The intake pipeline. Every lead — webhook or worksheet — goes through here,
 * so website, Google Ads and exhibit leads are normalised, deduped, tagged and
 * routed by exactly the same rules.
 */

const RAW_COLUMNS = ['Ref', 'Received At', 'Source', 'Sub-Source', 'Payload'];

/**
 * Archives the payload exactly as received and returns a reference for the
 * lead row. When a form changes shape, this is the record that explains what
 * actually arrived.
 * @param {string} source
 * @param {string} subSource
 * @param {*} payload
 * @return {string} Raw reference, e.g. "RAW-000123".
 */
function storeRaw_(source, subSource, payload) {
  const sheet = getOrCreateSheet_(SHEETS.raw, RAW_COLUMNS);
  const ref = 'RAW-' + Utilities.formatString('%06d', sheet.getLastRow());
  let serialised;
  try {
    serialised = typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch (err) {
    serialised = String(payload);
  }
  sheet.appendRow([ref, nowStamp_(), source, subSource, serialised.slice(0, 45000)]);
  return ref;
}

/**
 * Runs one record end to end.
 *
 * @param {!Object} input
 * @param {!Object<string,*>} input.flat Flattened key/value pairs.
 * @param {string} input.source One of SOURCES.
 * @param {string} input.subSource Form or fair name.
 * @param {string=} input.receivedAt
 * @param {string=} input.defaultEventType
 * @param {string=} input.rawRef
 * @return {{action: string, leadId: string, tab: string, row: number,
 *           eventType: string, reason: (string|undefined)}}
 */
function intakeRecord_(input) {
  const mapped = mapRecord_(input.flat);
  const lead = buildLead_({
    fields: mapped.fields,
    extras: mapped.extras,
    messages: mapped.messages,
    source: input.source,
    subSource: input.subSource,
    receivedAt: input.receivedAt,
    defaultEventType: input.defaultEventType,
    rawRef: input.rawRef
  });

  if (!lead.email && !lead.phone && !lead.fullName) {
    // Say which of the two it is: a form whose tokens were never substituted
    // is a configuration mistake, and "no contact details" sends someone
    // looking in the wrong place for it.
    const reason = mapped.placeholders
      ? 'the form sent its field tokens instead of the answers — check the body of the automation'
      : 'no contact details';
    log_('WARN', 'intake', 'Nothing usable in this submission', {
      subSource: input.subSource, reason: reason
    });
    return { action: 'skipped', reason: reason, leadId: '', tab: '', row: 0, eventType: '' };
  }
  if (!lead.email && !lead.phone) {
    lead.status = 'Needs Contact Info';
  }

  const duplicate = findDuplicate_(lead);
  if (duplicate) {
    const merged = mergeDuplicate_(lead, duplicate);
    return {
      action: merged.action,
      leadId: merged.leadId,
      tab: merged.tab,
      row: merged.row,
      eventType: lead.eventTypeLabel,
      reason: 'matched on ' + duplicate.matchedOn
    };
  }

  const placed = routeLead_(lead);
  return {
    action: 'created',
    leadId: lead.leadId,
    tab: placed.tab,
    row: placed.row,
    eventType: lead.eventTypeLabel
  };
}

/**
 * Runs a batch of records under a single lock, so an import cannot interleave
 * with an inbound webhook.
 * @param {!Array<!Object>} records Each shaped like intakeRecord_'s argument.
 * @param {string} context Label for the log.
 * @return {{total: number, created: number, merged: number, skipped: number,
 *           byTab: !Object<string,number>, results: !Array<!Object>}}
 */
function intakeBatch_(records, context) {
  return withLock_(function () {
    const summary = { total: records.length, created: 0, merged: 0, skipped: 0, byTab: {}, results: [] };

    records.forEach(function (record) {
      let result;
      try {
        result = intakeRecord_(record);
      } catch (err) {
        result = { action: 'error', reason: String(err && err.message || err), leadId: '', tab: '', row: 0 };
        log_('ERROR', context, 'Record failed', { error: String(err), record: record.subSource });
      }

      if (result.action === 'created') summary.created++;
      else if (result.action === 'skipped' || result.action === 'error') summary.skipped++;
      else summary.merged++;

      if (result.tab) summary.byTab[result.tab] = (summary.byTab[result.tab] || 0) + 1;
      summary.results.push(result);
    });

    log_('INFO', context, 'Batch complete', {
      total: summary.total, created: summary.created,
      merged: summary.merged, skipped: summary.skipped, byTab: summary.byTab
    });

    flushIndex_();
    flushSubSources_();
    housekeeping_();
    maybeSendDigest_(summary.created);
    return summary;
  }, 120000);
}

/** Keeps the archive tabs from growing without bound. */
function housekeeping_() {
  try {
    trimSheet_(SHEETS.raw, numberSetting_('Raw Payload Retention (rows)', 2000));
    trimSheet_(SHEETS.log, numberSetting_('Log Retention (rows)', 5000));
  } catch (err) {
    console.error('Housekeeping failed: ' + err);
  }
}

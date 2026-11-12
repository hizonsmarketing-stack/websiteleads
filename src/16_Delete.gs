/**
 * Deleting a lead for good.
 *
 * A lead lives in three places: the caller's row, the All Leads copy, and its
 * entries in the dedupe index. Deleting the row by hand clears one of them,
 * and that is worse than doing nothing. The lead id stays in the index, so the
 * next submission from that sender matches, fails to find the row it points
 * at, and is re-filed as a fresh row on the same tab. The caller deletes it
 * again, and so does it — which reads as the automation fighting them.
 *
 * Clearing all three is what makes a deletion hold. The sender writing again
 * is then simply a new lead, routed like any other: this removes a record, it
 * does not turn anybody away.
 *
 * Nothing here is truly unrecoverable. The original payload of every lead
 * stays in the _Raw archive.
 */

/**
 * Deletes leads outright, everywhere they are recorded.
 *
 * Rows are taken from the bottom up: each deletion shifts the rows under it,
 * so working downwards would delete the wrong ones from the second onwards —
 * the same trap the bulk move has, and silent in the same way.
 *
 * A row that is not a lead is reported rather than deleted. Deletion is the
 * one operation where guessing is unrecoverable, so it only ever touches rows
 * carrying a Lead ID it can account for.
 *
 * @param {string} fromTab
 * @param {!Array<number>} rows 1-based, in any order.
 * @return {{ok: boolean, problem: (string|undefined), deleted: !Array<!Object>,
 *     skipped: !Array<!Object>}}
 */
function deleteLeads(fromTab, rows) {
  return withLock_(function () {
    const wanted = (rows || [])
      .map(Number)
      .filter(function (row) { return row > 1; })
      .filter(function (row, i, all) { return all.indexOf(row) === i; })
      .sort(function (a, b) { return b - a; });

    if (!wanted.length) {
      return { ok: false, problem: 'No lead rows were selected.',
        deleted: [], skipped: [] };
    }

    const sheet = getSpreadsheet_().getSheetByName(fromTab);
    if (!sheet) {
      return { ok: false, problem: 'There is no tab called ' + fromTab + '.',
        deleted: [], skipped: [] };
    }

    const deleted = [];
    const skipped = [];

    wanted.forEach(function (row) {
      const found = leadAtRow_(fromTab, row);
      if (!found.ok) {
        skipped.push({ row: row, problem: found.problem });
        return;
      }
      const lead = found.lead;
      const name = cleanText_(lead.fullName) || cleanText_(lead.email) ||
        cleanText_(lead.phone) || found.leadId;

      // The index first, while the row it names is still there to be found.
      forgetIndexEntries_(found.leadId);

      const allLeads = getSpreadsheet_().getSheetByName(SHEETS.allLeads);
      if (allLeads) {
        const copy = findLeadRow_(allLeads, found.leadId, 0);
        if (copy) allLeads.deleteRow(copy);
      }

      sheet.deleteRow(row);
      shiftIndexRowsAfterDelete_(fromTab, row);
      deleted.push({ row: row, name: name, leadId: found.leadId });
    });

    log_('INFO', 'delete', 'Deleted leads', {
      tab: fromTab, deleted: deleted.length, skipped: skipped.length
    });
    return {
      ok: deleted.length > 0,
      deleted: deleted.reverse(),
      skipped: skipped.reverse()
    };
  }, 300000);
}

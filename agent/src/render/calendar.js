/**
 * Laying the recommendations out over the coming weeks.
 *
 * Two constraints decide where a piece lands. Each channel can only absorb so
 * many pieces a week (a team that can shoot one long video a week cannot shoot
 * four), and each has a lead time — you cannot publish a venue walkthrough
 * three days from now because it has to be filmed first. Highest priority
 * first, into the earliest week that has room.
 */

import { CHANNELS, PLAN } from '../config.js';
import { addDays, isoDate, startOfWeek } from '../dates.js';

export function buildCalendar(recommendations, { now, horizonWeeks = PLAN.horizonWeeks } = {}) {
  const firstWeek = startOfWeek(addDays(now, 7));

  const weeks = Array.from({ length: horizonWeeks }, (_, index) => {
    const start = addDays(firstWeek, index * 7);
    return {
      index: index + 1,
      startDate: isoDate(start),
      endDate: isoDate(addDays(start, 6)),
      items: [],
      // Remaining capacity per channel, decremented as pieces are placed.
      remaining: Object.fromEntries(Object.entries(CHANNELS).map(([id, c]) => [id, c.capacity])),
    };
  });

  const ordered = [...recommendations].sort((a, b) => (a.priority || 3) - (b.priority || 3));
  const unscheduled = [];

  for (const rec of ordered) {
    const channel = CHANNELS[rec.channel];
    if (!channel) { unscheduled.push({ ...rec, reason: `Unknown channel "${rec.channel}"` }); continue; }

    const earliest = addDays(now, channel.leadTimeDays);
    const week = weeks.find((w) => w.remaining[rec.channel] > 0 && new Date(w.endDate) >= earliest);

    if (!week) {
      unscheduled.push({
        ...rec,
        reason: `No ${channel.label} capacity left in the next ${horizonWeeks} weeks`,
      });
      continue;
    }

    week.remaining[rec.channel] -= 1;
    week.items.push({ ...rec, publishBy: week.endDate });
  }

  // Within a week, read in priority order.
  for (const week of weeks) week.items.sort((a, b) => (a.priority || 3) - (b.priority || 3));

  return { weeks, unscheduled };
}

const CSV_HEADERS = [
  'Week', 'Publish by', 'Channel', 'Format', 'Title', 'Target keyword',
  'Priority', 'Effort', 'Why now', 'Must include', 'Assets needed', 'CTA', 'Status',
];

/** RFC 4180: quote everything, double the internal quotes. Sheets imports it cleanly. */
function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function calendarToCsv({ weeks, unscheduled }) {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];

  for (const week of weeks) {
    for (const item of week.items) {
      lines.push([
        `Week ${week.index} (${week.startDate})`,
        item.publishBy,
        CHANNELS[item.channel]?.label || item.channel,
        item.format,
        item.title,
        item.targetKeyword,
        item.priority,
        item.effort,
        item.whyNow,
        item.mustInclude,
        item.assets,
        item.cta,
        'Not started',
      ].map(csvCell).join(','));
    }
  }

  // Kept in the file rather than dropped — a piece that didn't fit is
  // information, and the next run's capacity may absorb it.
  for (const item of unscheduled) {
    lines.push([
      'Backlog', '', CHANNELS[item.channel]?.label || item.channel, item.format, item.title,
      item.targetKeyword, item.priority, item.effort, `${item.whyNow} (${item.reason})`,
      item.mustInclude, item.assets, item.cta, 'Backlog',
    ].map(csvCell).join(','));
  }

  return `${lines.join('\n')}\n`;
}

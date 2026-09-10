/**
 * Finding the opportunities.
 *
 * Five detectors, each answering a different question, all of them producing
 * the same shape of record so they can be scored against one another:
 *
 *   striking distance - we rank on page two; a rewrite moves us to page one
 *   low CTR           - people see us and don't click; a title problem
 *   decay             - a page that used to work and has stopped
 *   competitor gap    - they rank for it, we don't appear at all
 *   unserved demand   - volume we have no page for
 *
 * Every opportunity carries the evidence that produced it. A recommendation
 * nobody can audit is a recommendation nobody acts on.
 */

import { THRESHOLDS, PLAN } from './config.js';
import { chooseChannels, classifyEventType, classifyIntent, demandWeight, seasonalWeight } from './classify.js';

/** Strips protocol and host so a GSC page URL and a GA4 path can be compared. */
export function pathOf(url) {
  if (!url) return '';
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return String(url).split('?')[0].replace(/\/+$/, '') || '/';
  }
}

function opportunity(kind, keyword, fields) {
  return {
    kind,
    keyword,
    intent: classifyIntent(keyword),
    eventType: classifyEventType(keyword),
    volume: 0,
    position: null,
    url: '',
    evidence: [],
    ...fields,
  };
}

/**
 * Positions 4-20 with real volume behind them.
 *
 * Both sources are consulted and the better-informed one wins: Search Console
 * knows our true average position, Semrush knows the search volume. Where a
 * keyword appears in both, we take position from Search Console and volume
 * from Semrush.
 */
export function findStrikingDistance({ semrushKeywords, gscQueries }) {
  const { minPosition, maxPosition, minVolume } = THRESHOLDS.strikingDistance;
  const volumeByKeyword = new Map(semrushKeywords.map((row) => [row.keyword.toLowerCase(), row]));
  const seen = new Set();
  const found = [];

  for (const row of gscQueries) {
    const key = row.query.toLowerCase();
    const semrush = volumeByKeyword.get(key);
    const volume = semrush?.volume || estimateVolume(row.impressions);
    if (row.position < minPosition || row.position > maxPosition || volume < minVolume) continue;

    seen.add(key);
    found.push(opportunity('striking-distance', row.query, {
      volume,
      position: Number(row.position.toFixed(1)),
      url: semrush?.url || '',
      impressions: row.impressions,
      clicks: row.clicks,
      evidence: [
        `Ranking ${row.position.toFixed(1)} in Search Console over the window`,
        `${row.impressions.toLocaleString()} impressions, ${row.clicks} clicks`,
        semrush ? `Semrush puts monthly volume at ${volume.toLocaleString()}` : 'Volume estimated from impressions (not in Semrush export)',
      ],
    }));
  }

  // Keywords Semrush sees us ranking for that Search Console didn't surface,
  // usually because they sit just under its reporting threshold.
  for (const row of semrushKeywords) {
    const key = row.keyword.toLowerCase();
    if (seen.has(key)) continue;
    if (row.position < minPosition || row.position > maxPosition || row.volume < minVolume) continue;

    found.push(opportunity('striking-distance', row.keyword, {
      volume: row.volume,
      position: row.position,
      url: row.url,
      evidence: [
        `Semrush has us at position ${row.position} for this`,
        `${row.volume.toLocaleString()} searches a month`,
        row.previousPosition && row.previousPosition > row.position
          ? `Improved from ${row.previousPosition} since the last crawl`
          : null,
      ].filter(Boolean),
    }));
  }

  return found;
}

/** Impressions are roughly a tenth of monthly volume for a page-two ranking. */
function estimateVolume(impressions) {
  return Math.round((impressions / 3) * 10) / 10;
}

/** Seen a lot, clicked rarely. The content is fine; the title isn't. */
export function findLowCtr({ gscQueries }) {
  const { minImpressions, maxCtr } = THRESHOLDS.lowCtr;
  return gscQueries
    .filter((row) => row.impressions >= minImpressions && row.ctr <= maxCtr && row.position <= 20)
    .map((row) => opportunity('low-ctr', row.query, {
      volume: estimateVolume(row.impressions),
      position: Number(row.position.toFixed(1)),
      impressions: row.impressions,
      clicks: row.clicks,
      evidence: [
        `${row.impressions.toLocaleString()} people saw us for this and ${row.clicks} clicked`,
        `${(row.ctr * 100).toFixed(2)}% click-through at position ${row.position.toFixed(1)}`,
        'At this position the listing should be earning several times that — the title and description are the likely cause',
      ],
    }));
}

/**
 * Pages that have lost traffic against the previous window.
 *
 * Keyed by path so Search Console URLs and GA4 paths line up. Reported per
 * page rather than per keyword, because the fix is to the page.
 */
export function findDecay({ gscPages, gscPriorPages, gscQueriesByPage }) {
  const { minDropRatio, minPriorClicks } = THRESHOLDS.decay;
  const current = new Map(gscPages.map((row) => [pathOf(row.page), row]));
  const queriesFor = new Map();

  for (const row of gscQueriesByPage) {
    const path = pathOf(row.page);
    if (!queriesFor.has(path)) queriesFor.set(path, []);
    queriesFor.get(path).push(row);
  }

  const found = [];
  for (const priorRow of gscPriorPages) {
    const path = pathOf(priorRow.page);
    if (priorRow.clicks < minPriorClicks) continue;

    const nowClicks = current.get(path)?.clicks || 0;
    const drop = (priorRow.clicks - nowClicks) / priorRow.clicks;
    if (drop < minDropRatio) continue;

    // Name the page by its best query — "/blog/post-42" tells nobody anything.
    const topQuery = (queriesFor.get(path) || [])
      .sort((a, b) => b.impressions - a.impressions)[0];

    found.push(opportunity('decay', topQuery?.query || path, {
      volume: estimateVolume(topQuery?.impressions || 0),
      position: topQuery ? Number(topQuery.position.toFixed(1)) : null,
      url: priorRow.page,
      page: path,
      evidence: [
        `Clicks fell from ${priorRow.clicks} to ${nowClicks} against the previous 90 days — down ${Math.round(drop * 100)}%`,
        topQuery ? `Its strongest query is "${topQuery.query}" at position ${topQuery.position.toFixed(1)}` : null,
        'A page that used to earn traffic and stopped is cheaper to fix than a new page is to write',
      ].filter(Boolean),
    }));
  }

  return found;
}

/** They rank top-10, we don't rank at all. */
export function findCompetitorGaps({ semrushKeywords, competitorKeywords }) {
  const { competitorMaxPosition, minVolume } = THRESHOLDS.gap;
  const ours = new Set(semrushKeywords.map((row) => row.keyword.toLowerCase()));
  const byKeyword = new Map();

  for (const [domain, keywords] of Object.entries(competitorKeywords)) {
    for (const row of keywords) {
      const key = row.keyword.toLowerCase();
      if (ours.has(key) || row.position > competitorMaxPosition || row.volume < minVolume) continue;

      if (!byKeyword.has(key)) {
        byKeyword.set(key, { keyword: row.keyword, volume: row.volume, rivals: [] });
      }
      byKeyword.get(key).rivals.push({ domain, position: row.position });
    }
  }

  return [...byKeyword.values()].map((entry) => {
    const rivals = entry.rivals.sort((a, b) => a.position - b.position);
    return opportunity('competitor-gap', entry.keyword, {
      volume: entry.volume,
      position: null,
      competitors: rivals,
      evidence: [
        `${entry.volume.toLocaleString()} searches a month and we do not rank for it at all`,
        `${rivals.map((r) => `${r.domain} at ${r.position}`).join(', ')}`,
        rivals.length > 1
          ? `${rivals.length} competitors hold page one, so the query is commercially proven`
          : 'A single competitor holds it, which usually means it is winnable',
      ],
    });
  });
}

/** Volume we get impressions for but have no page addressing. */
export function findUnservedDemand({ gscQueries, blogPosts }) {
  const covered = new Set();
  for (const post of blogPosts) {
    for (const word of `${post.title} ${post.slug}`.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length > 3) covered.add(word);
    }
  }

  return gscQueries
    .filter((row) => row.position > 20 && row.impressions >= 100)
    .filter((row) => {
      const words = row.query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      if (!words.length) return false;
      const overlap = words.filter((w) => covered.has(w)).length / words.length;
      // Under half the meaningful words appear anywhere in the inventory.
      return overlap < 0.5;
    })
    .map((row) => opportunity('unserved-demand', row.query, {
      volume: estimateVolume(row.impressions),
      position: Number(row.position.toFixed(1)),
      impressions: row.impressions,
      evidence: [
        `${row.impressions.toLocaleString()} impressions at position ${row.position.toFixed(1)} — we are being shown but not seriously considered`,
        'No existing post covers this topic, so there is nothing to improve; it needs a page of its own',
      ],
    }));
}

/**
 * Scoring.
 *
 * Volume is the base, then multiplied by how winnable the opportunity is, how
 * much the business wants that kind of work, and where we are in its booking
 * window. Log on volume so one 12,000-a-month head term cannot bury twenty
 * realistic ones.
 */
const KIND_MULTIPLIER = {
  'striking-distance': 1.5,   // cheapest win available
  'low-ctr': 1.4,             // a title rewrite, an afternoon's work
  decay: 1.3,                 // was working once, will again
  'competitor-gap': 1.0,      // proven, but starting from nothing
  'unserved-demand': 0.9,     // real demand, least evidence we can win it
};

export function scoreOpportunity(item, { leads, now }) {
  const base = Math.log10(Math.max(item.volume, 1) + 1) * 10;
  const kind = KIND_MULTIPLIER[item.kind] ?? 1;

  // Closer to page one is cheaper to finish.
  const positional = item.position ? 1 + Math.max(0, (21 - item.position)) / 40 : 1;

  const season = seasonalWeight(item.eventType, now);
  const demand = demandWeight(item.eventType, leads);

  const score = base * kind * positional * season.multiplier * demand;

  return {
    ...item,
    score: Number(score.toFixed(1)),
    seasonNote: season.note,
    seasonMultiplier: season.multiplier,
    demandMultiplier: Number(demand.toFixed(2)),
  };
}

/**
 * Everything, scored, deduplicated and cut to the shortlist.
 *
 * Deduplication matters more than it looks: the same keyword can legitimately
 * surface as striking-distance *and* low-CTR, and shipping both would put two
 * near-identical items on the calendar. The higher-scoring one wins and the
 * other's evidence is folded into it.
 */
export function buildOpportunities(data, { now, leads }) {
  const all = [
    ...findStrikingDistance(data),
    ...findLowCtr(data),
    ...findDecay(data),
    ...findCompetitorGaps(data),
    ...findUnservedDemand(data),
  ].filter((item) => item.volume >= THRESHOLDS.minVolumeAnywhere);

  const scored = all.map((item) => scoreOpportunity(item, { leads, now }));
  const byKeyword = new Map();

  for (const item of scored.sort((a, b) => b.score - a.score)) {
    const key = item.keyword.toLowerCase().trim();
    const existing = byKeyword.get(key);
    if (!existing) {
      byKeyword.set(key, { ...item, alsoFlaggedAs: [] });
      continue;
    }
    existing.alsoFlaggedAs.push(item.kind);
    existing.evidence = [...existing.evidence, ...item.evidence];
  }

  return [...byKeyword.values()]
    .map((item) => ({ ...item, channels: chooseChannels(item.keyword, item.intent) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PLAN.shortlistSize);
}

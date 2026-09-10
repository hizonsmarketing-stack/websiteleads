/**
 * The dashboard.
 *
 * Emitted as one self-contained page: no build step, no external assets beyond
 * the two font families, nothing to serve. `renderStandalone` wraps it as a
 * complete document for GitHub Pages or a downloaded artifact; `renderFragment`
 * returns just the content, which is the shape the Artifact publisher wants.
 */

import { BUSINESS, CHANNELS, SEASONALITY } from '../config.js';

/**
 * Event-type colours, validated for both themes against the six checks in the
 * dataviz reference — lightness band, chroma floor, CVD separation on adjacent
 * pairs, normal-vision floor, and contrast against each surface. Changing one
 * of these means re-running that validator, not eyeballing it.
 */
const EVENT_COLORS = {
  Wedding: { light: '#00897B', dark: '#17A092' },
  Corporate: { light: '#C0761F', dark: '#C57F2B' },
  Debut: { light: '#8E3D9E', dark: '#A057B0' },
  "Kid's Party": { light: '#5C8F14', dark: '#6FA525' },
  'Private Event': { light: '#2C5DBF', dark: '#4A7ED4' },
};

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function eventVar(eventType) {
  return eventType && EVENT_COLORS[eventType] ? `var(--ev-${slug(eventType)})` : 'var(--ink-muted)';
}

const KIND_LABELS = {
  'striking-distance': 'Page two',
  'low-ctr': 'Seen, not clicked',
  decay: 'Losing traffic',
  'competitor-gap': 'Competitor gap',
  'unserved-demand': 'Unserved demand',
};

const styles = () => `
:root {
  --paper: #FBFAF7;
  --surface: #FFFFFF;
  --surface-sunk: #F3F1EC;
  --edge: #E2DED4;
  --edge-strong: #CBC5B7;
  --ink: #1A1F1D;
  --ink-soft: #46504C;
  --ink-muted: #6E7873;
  --accent: #B0670F;
  --accent-soft: #F6ECDD;
  --good: #2F6F46;
  --warn: #9A6B00;
  --critical: #A6371F;
  --ev-wedding: ${EVENT_COLORS.Wedding.light};
  --ev-corporate: ${EVENT_COLORS.Corporate.light};
  --ev-debut: ${EVENT_COLORS.Debut.light};
  --ev-kid-s-party: ${EVENT_COLORS["Kid's Party"].light};
  --ev-private-event: ${EVENT_COLORS['Private Event'].light};
  --display: Fraunces, Georgia, 'Times New Roman', serif;
  --body: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #121614;
    --surface: #1A1F1D;
    --surface-sunk: #232926;
    --edge: #2E3733;
    --edge-strong: #414C47;
    --ink: #ECEAE3;
    --ink-soft: #B4BDB8;
    --ink-muted: #838C88;
    --accent: #D9964A;
    --accent-soft: #2A2119;
    --good: #5FA97B;
    --warn: #C79A3B;
    --critical: #D2705A;
    --ev-wedding: ${EVENT_COLORS.Wedding.dark};
    --ev-corporate: ${EVENT_COLORS.Corporate.dark};
    --ev-debut: ${EVENT_COLORS.Debut.dark};
    --ev-kid-s-party: ${EVENT_COLORS["Kid's Party"].dark};
    --ev-private-event: ${EVENT_COLORS['Private Event'].dark};
  }
}

:root[data-theme="dark"] {
  --paper: #121614;
  --surface: #1A1F1D;
  --surface-sunk: #232926;
  --edge: #2E3733;
  --edge-strong: #414C47;
  --ink: #ECEAE3;
  --ink-soft: #B4BDB8;
  --ink-muted: #838C88;
  --accent: #D9964A;
  --accent-soft: #2A2119;
  --good: #5FA97B;
  --warn: #C79A3B;
  --critical: #D2705A;
  --ev-wedding: ${EVENT_COLORS.Wedding.dark};
  --ev-corporate: ${EVENT_COLORS.Corporate.dark};
  --ev-debut: ${EVENT_COLORS.Debut.dark};
  --ev-kid-s-party: ${EVENT_COLORS["Kid's Party"].dark};
  --ev-private-event: ${EVENT_COLORS['Private Event'].dark};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.wrap {
  max-width: 1080px;
  margin: 0 auto;
  padding-inline: 20px;
  padding-block: 40px 64px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

h1, h2, h3 { font-family: var(--display); font-weight: 600; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(30px, 5vw, 44px); line-height: 1.08; letter-spacing: -0.015em; }
h2 { font-size: 21px; letter-spacing: -0.005em; }
h3 { font-size: 16px; }
p { margin: 0; }

.eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.13em;
  color: var(--ink-muted);
  font-weight: 600;
}

/* ---- masthead ---- */
.masthead { display: flex; flex-direction: column; gap: 14px; }
.masthead .lede {
  font-size: 17px; color: var(--ink-soft); max-width: 62ch; line-height: 1.6;
}
.run-meta {
  display: flex; flex-wrap: wrap; gap: 8px 20px;
  font-family: var(--mono); font-size: 12px; color: var(--ink-muted);
  border-top: 1px solid var(--edge); padding-top: 14px;
}

/* ---- source provenance ---- */
.sources { display: flex; flex-wrap: wrap; gap: 8px; }
.source {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 11px; border-radius: 999px;
  font-size: 12px; font-weight: 500;
  border: 1px solid var(--edge); background: var(--surface); color: var(--ink-soft);
}
.source::before {
  content: ''; width: 7px; height: 7px; border-radius: 50%;
  background: var(--edge-strong); flex: none;
}
.source.live::before { background: var(--good); }
.source.live { color: var(--ink); }

/* ---- stat tiles ---- */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px;
  background: var(--edge); border: 1px solid var(--edge); border-radius: 8px; overflow: hidden; }
.stat { background: var(--surface); padding: 18px 20px; display: flex; flex-direction: column; gap: 3px; }
.stat .value {
  font-family: var(--mono); font-size: 27px; font-weight: 600;
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.15;
}
.stat .label { font-size: 12px; color: var(--ink-muted); }

/* ---- recommendations ---- */
.channel-group { display: flex; flex-direction: column; gap: 12px; }
.channel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.channel-head .count { font-family: var(--mono); font-size: 12px; color: var(--ink-muted); }

.rec {
  border: 1px solid var(--edge); border-left: 3px solid var(--stripe, var(--edge-strong));
  border-radius: 6px; background: var(--surface); overflow: hidden;
}
.rec-main { padding: 16px 18px; display: flex; flex-direction: column; gap: 9px; }
.rec-top { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; }
.rec-title { font-family: var(--display); font-size: 17px; font-weight: 600; line-height: 1.3; text-wrap: balance; }
.rec-angle { color: var(--ink-soft); font-size: 14px; }

.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip {
  font-size: 11px; padding: 3px 9px; border-radius: 4px;
  background: var(--surface-sunk); color: var(--ink-soft); white-space: nowrap;
}
.chip.event { color: var(--evc); border: 1px solid color-mix(in srgb, var(--evc) 35%, transparent);
  background: color-mix(in srgb, var(--evc) 9%, transparent); font-weight: 600; }
.chip.kw { font-family: var(--mono); font-size: 11px; }

.prio {
  flex: none; display: flex; flex-direction: column; align-items: center; gap: 1px;
  font-family: var(--mono); padding-top: 2px;
}
.prio .n { font-size: 19px; font-weight: 700; color: var(--stripe, var(--ink)); line-height: 1; }
.prio .l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--ink-muted); }

.why {
  font-size: 13px; color: var(--ink-soft);
  background: var(--surface-sunk); padding: 9px 12px; border-radius: 5px;
}
.why strong { color: var(--ink); font-weight: 600; }

details.evidence { border-top: 1px solid var(--edge); }
details.evidence summary {
  cursor: pointer; padding: 10px 18px; font-size: 12px; color: var(--ink-muted);
  list-style: none; display: flex; align-items: center; gap: 6px;
}
details.evidence summary::-webkit-details-marker { display: none; }
details.evidence summary::before { content: '▸'; font-size: 10px; transition: transform 0.15s; }
details.evidence[open] summary::before { transform: rotate(90deg); }
details.evidence summary:hover { color: var(--ink); }
.evidence-body { padding: 0 18px 16px; display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.evidence-body h4 { margin: 0 0 5px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-muted); font-weight: 600; font-family: var(--body); }
.evidence-body ul { margin: 0; padding-left: 17px; font-size: 13px; color: var(--ink-soft); display: flex; flex-direction: column; gap: 3px; }

/* ---- calendar ---- */
.weeks { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.week { border: 1px solid var(--edge); border-radius: 6px; background: var(--surface); display: flex; flex-direction: column; }
.week-head {
  padding: 10px 13px; border-bottom: 1px solid var(--edge); background: var(--surface-sunk);
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
}
.week-head .wk { font-weight: 600; font-size: 13px; }
.week-head .dates { font-family: var(--mono); font-size: 11px; color: var(--ink-muted); }
.week-items { padding: 9px; display: flex; flex-direction: column; gap: 7px; flex: 1; }
.week-item {
  font-size: 12.5px; line-height: 1.4; padding: 8px 10px; border-radius: 4px;
  background: var(--surface-sunk); border-left: 2px solid var(--evc, var(--edge-strong));
  display: flex; flex-direction: column; gap: 3px;
}
.week-item .ch { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-muted); }
.week-empty { font-size: 12px; color: var(--ink-muted); font-style: italic; padding: 8px 10px; }

/* ---- season strip ---- */
.season { display: flex; flex-direction: column; gap: 3px; }
.season-row { display: grid; grid-template-columns: 108px 1fr; gap: 10px; align-items: center; }
.season-label { font-size: 12.5px; color: var(--ink-soft); text-align: right; }
.season-months { display: grid; grid-template-columns: repeat(12, 1fr); gap: 2px; }
.season-cell {
  height: 21px; border-radius: 3px; background: var(--surface-sunk);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; color: var(--ink-muted); font-family: var(--mono);
}
.season-cell.window { background: color-mix(in srgb, var(--evc) 26%, transparent); color: var(--ink-soft); }
.season-cell.peak { background: var(--evc); color: var(--surface); font-weight: 700; }
.season-cell.now { outline: 2px solid var(--accent); outline-offset: 1px; }
.season-key { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 11.5px; color: var(--ink-muted); margin-top: 6px; }

/* ---- lead mix bars ---- */
.bars { display: flex; flex-direction: column; gap: 9px; }
.bar-row { display: grid; grid-template-columns: 108px 1fr 48px; gap: 10px; align-items: center; }
.bar-label { font-size: 12.5px; color: var(--ink-soft); text-align: right; }
.bar-track { background: var(--surface-sunk); border-radius: 3px; height: 15px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--evc, var(--accent)); border-radius: 0 3px 3px 0; }
.bar-value { font-family: var(--mono); font-size: 12.5px; font-variant-numeric: tabular-nums; color: var(--ink-soft); }

/* ---- backlog + footer ---- */
.backlog { border: 1px dashed var(--edge-strong); border-radius: 6px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 7px; background: var(--surface); }
.backlog li { font-size: 13px; color: var(--ink-soft); }
.backlog ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }

footer { border-top: 1px solid var(--edge); padding-top: 18px; font-size: 12.5px; color: var(--ink-muted);
  display: flex; flex-direction: column; gap: 7px; }
footer code { font-family: var(--mono); font-size: 11.5px; background: var(--surface-sunk); padding: 1px 5px; border-radius: 3px; }

.note { font-size: 13px; color: var(--ink-soft); background: var(--accent-soft);
  border-left: 3px solid var(--accent); padding: 11px 14px; border-radius: 0 5px 5px 0; }

@media (max-width: 560px) {
  .season-row, .bar-row { grid-template-columns: 76px 1fr; }
  .bar-value { grid-column: 2; text-align: right; }
  .season-label, .bar-label { text-align: left; font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

function statTiles(context) {
  const tiles = [
    { value: context.opportunityCount, label: 'Opportunities found' },
    { value: context.recommendationCount, label: 'Pieces recommended' },
    { value: context.scheduledCount, label: `Scheduled over ${context.horizonWeeks} weeks` },
  ];
  if (context.leads?.total) {
    tiles.push({ value: context.leads.total, label: 'Enquiries in the window' });
  }
  return `<div class="stats">${tiles.map((tile) => `
      <div class="stat"><span class="value">${esc(tile.value)}</span><span class="label">${esc(tile.label)}</span></div>`).join('')}</div>`;
}

function recommendationCard(rec) {
  const opp = rec.opportunity;
  const eventType = opp?.eventType;
  const stripe = rec.priority <= 2 ? 'var(--accent)' : rec.priority === 3 ? 'var(--edge-strong)' : 'var(--edge)';
  const style = `--stripe:${stripe};${eventType ? `--evc:${eventVar(eventType)};` : ''}`;

  const chips = [
    eventType ? `<span class="chip event" style="--evc:${eventVar(eventType)}">${esc(eventType)}</span>` : '',
    `<span class="chip">${esc(rec.format)}</span>`,
    `<span class="chip">Effort ${esc(rec.effort)}</span>`,
    opp?.kind ? `<span class="chip">${esc(KIND_LABELS[opp.kind] || opp.kind)}</span>` : '',
    rec.targetKeyword ? `<span class="chip kw">${esc(rec.targetKeyword)}</span>` : '',
  ].join('');

  const facts = opp ? [
    opp.volume ? `${Math.round(opp.volume).toLocaleString()}/mo searches` : null,
    opp.position ? `we rank ${opp.position}` : 'not ranking',
    opp.url ? `<a href="${esc(opp.url)}" style="color:inherit">existing page</a>` : null,
  ].filter(Boolean).join(' · ') : '';

  return `
  <article class="rec" style="${style}">
    <div class="rec-main">
      <div class="rec-top">
        <div style="display:flex;flex-direction:column;gap:7px">
          <div class="rec-title">${esc(rec.title)}</div>
          <p class="rec-angle">${esc(rec.angle)}</p>
        </div>
        <div class="prio"><span class="n">${esc(rec.priority)}</span><span class="l">Prio</span></div>
      </div>
      <div class="chips">${chips}</div>
      <p class="why"><strong>Why now:</strong> ${esc(rec.whyNow)}</p>
    </div>
    <details class="evidence">
      <summary>Brief and evidence${facts ? ` — ${facts.replace(/<[^>]+>/g, '')}` : ''}</summary>
      <div class="evidence-body">
        <div>
          <h4>Must include</h4>
          <ul>${(rec.mustInclude || []).map((point) => `<li>${esc(point)}</li>`).join('')}</ul>
        </div>
        <div>
          <h4>Assets to gather</h4>
          <ul>${(rec.assets || []).map((asset) => `<li>${esc(asset)}</li>`).join('') || '<li>Nothing to shoot</li>'}</ul>
        </div>
        <div>
          <h4>Evidence</h4>
          <ul>${(opp?.evidence || []).map((line) => `<li>${esc(line)}</li>`).join('') || '<li>—</li>'}</ul>
        </div>
        <div>
          <h4>Call to action</h4>
          <ul><li>${esc(rec.cta)}</li></ul>
        </div>
      </div>
    </details>
  </article>`;
}

function seasonStrip(now) {
  const currentMonth = new Date(now).getUTCMonth() + 1;

  const rows = SEASONALITY.map((season) => {
    const windowMonths = new Set();
    for (const peak of season.peakMonths) {
      for (let back = 1; back <= season.leadMonths; back += 1) {
        windowMonths.add(((peak - back - 1 + 120) % 12) + 1);
      }
    }

    const cells = MONTHS.map((letter, index) => {
      const month = index + 1;
      const peak = season.peakMonths.includes(month);
      const inWindow = windowMonths.has(month);
      const classes = ['season-cell', peak ? 'peak' : inWindow ? 'window' : '', month === currentMonth ? 'now' : '']
        .filter(Boolean).join(' ');
      return `<div class="${classes}" title="${esc(season.eventType)} — ${peak ? 'peak month' : inWindow ? 'buyers deciding' : 'quiet'}">${letter}</div>`;
    }).join('');

    return `<div class="season-row" style="--evc:${eventVar(season.eventType)}">
      <div class="season-label">${esc(season.eventType)}</div>
      <div class="season-months">${cells}</div>
    </div>`;
  }).join('');

  return `<div class="season">${rows}</div>
  <div class="season-key">
    <span>Solid = event peaks that month</span>
    <span>Tinted = buyers are choosing a caterer</span>
    <span>Outlined = this month</span>
  </div>`;
}

function leadBars(leads) {
  if (!leads?.total) return '';
  const entries = Object.entries(leads.byEventType)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, count]) => count));

  return `<div class="bars">${entries.map(([eventType, count]) => `
    <div class="bar-row" style="--evc:${eventVar(eventType)}">
      <div class="bar-label">${esc(eventType)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${((count / max) * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${count}</div>
    </div>`).join('')}</div>`;
}

function calendarGrid(calendar) {
  return `<div class="weeks">${calendar.weeks.map((week) => `
    <div class="week">
      <div class="week-head">
        <span class="wk">Week ${week.index}</span>
        <span class="dates">${esc(week.startDate.slice(5))} – ${esc(week.endDate.slice(5))}</span>
      </div>
      <div class="week-items">
        ${week.items.length ? week.items.map((item) => `
          <div class="week-item" style="--evc:${eventVar(item.opportunity?.eventType)}">
            <span class="ch">${esc(CHANNELS[item.channel]?.label.split(' ')[0] || item.channel)} · ${esc(item.format)}</span>
            <span>${esc(item.title)}</span>
          </div>`).join('') : '<div class="week-empty">Nothing scheduled</div>'}
      </div>
    </div>`).join('')}</div>`;
}

/** The page body. Shared by both wrappers. */
export function renderFragment({ plan, calendar, context }) {
  const byChannel = new Map();
  for (const rec of plan.recommendations) {
    if (!byChannel.has(rec.channel)) byChannel.set(rec.channel, []);
    byChannel.get(rec.channel).push(rec);
  }

  const channelSections = [...byChannel.entries()].map(([id, recs]) => `
    <section class="channel-group">
      <div class="channel-head">
        <h2>${esc(CHANNELS[id]?.label || id)}</h2>
        <span class="count">${recs.length} piece${recs.length === 1 ? '' : 's'} · ${CHANNELS[id]?.capacity ?? '?'}/week capacity</span>
      </div>
      ${recs.sort((a, b) => a.priority - b.priority).map(recommendationCard).join('')}
    </section>`).join('');

  const sourceChips = context.sources.map((source) => `
    <span class="source ${source.ready ? 'live' : ''}" title="${source.ready ? 'Live data this run' : `Not configured — set ${esc(source.missing)}`}">${esc(source.label)}${source.ready ? '' : ' — not configured'}</span>`).join('');

  const fallbackNote = context.planSource !== 'claude'
    ? `<p class="note">These briefs were generated without Claude (<code>${esc(context.planSource)}</code>), so the titles and angles are mechanical placeholders. The opportunities, scores and scheduling below are real. Set <code>ANTHROPIC_API_KEY</code> to get written briefs.</p>`
    : '';

  return `
<div class="wrap">
  <header class="masthead">
    <span class="eyebrow">Content plan · ${esc(BUSINESS.name)}</span>
    <h1>What to publish next</h1>
    <p class="lede">${esc(plan.summary)}</p>
    <div class="sources">${sourceChips}</div>
    <div class="run-meta">
      <span>Generated ${esc(context.today)}</span>
      <span>Window ${esc(context.windows.current.startDate)} → ${esc(context.windows.current.endDate)}</span>
      <span>${esc(BUSINESS.domain)}</span>
    </div>
  </header>

  ${fallbackNote}

  ${statTiles(context)}

  ${channelSections}

  <section class="channel-group">
    <div class="channel-head">
      <h2>The next ${context.horizonWeeks} weeks</h2>
      <span class="count">${context.scheduledCount} scheduled${calendar.unscheduled.length ? ` · ${calendar.unscheduled.length} in backlog` : ''}</span>
    </div>
    ${calendarGrid(calendar)}
    ${calendar.unscheduled.length ? `
      <div class="backlog">
        <span class="eyebrow">Backlog — no capacity in this horizon</span>
        <ul>${calendar.unscheduled.map((item) => `<li>${esc(item.title)} <span style="color:var(--ink-muted)">— ${esc(item.reason)}</span></li>`).join('')}</ul>
      </div>` : ''}
  </section>

  <section class="channel-group">
    <div class="channel-head"><h2>Booking seasons</h2>
      <span class="count">when buyers decide, not when events happen</span></div>
    ${seasonStrip(context.now)}
  </section>

  ${context.leads?.total ? `
  <section class="channel-group">
    <div class="channel-head"><h2>Enquiries received</h2>
      <span class="count">${context.leads.total} in the window, from the lead sheet</span></div>
    ${leadBars(context.leads)}
  </section>` : ''}

  <footer>
    <span>Built from ${esc(context.sources.filter((s) => s.ready).map((s) => s.label).join(', ') || 'fixtures only')}.</span>
    ${context.dataErrors.length ? `<span>Partial data this run: ${esc(context.dataErrors.join('; '))}</span>` : ''}
    <span>Regenerated by the <code>content-agent</code> workflow. Edit <code>agent/src/config.js</code> to change channels, thresholds or seasons.</span>
  </footer>
</div>`;
}

/** A complete HTML document, for GitHub Pages or a downloaded artifact. */
export function renderStandalone(input) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>What to Publish Next</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap">
<style>${styles()}</style>
</head>
<body>${renderFragment(input)}</body>
</html>`;
}

/** Head-less form, for the Artifact publisher which supplies its own shell. */
export function renderArtifact(input) {
  return `<title>What to Publish Next</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap">
<style>${styles()}</style>
${renderFragment(input)}`;
}

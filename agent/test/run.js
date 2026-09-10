/**
 * The content agent under Node, with no credentials and no network:
 *
 *   npm run test:agent
 *
 * Every external call is a stub. What is asserted is the part that decides
 * what the team is told to make — which opportunities are found, how they are
 * scored, where they land on the calendar — plus the parsing of each API's
 * particular idea of a response, which is where connectors usually break.
 */

import { parseSemrushCsv } from '../src/connectors/semrush.js';
import { shapeReport } from '../src/connectors/ga4.js';
import { rowsToObjects } from '../src/connectors/leads.js';
import { createGoogleAuth } from '../src/connectors/google-auth.js';
import { createWixClient } from '../src/connectors/wix.js';
import { request, HttpError } from '../src/http.js';
import { loadEnv, describeSources } from '../src/env.js';
import { comparisonWindows, startOfWeek, isoDate } from '../src/dates.js';
import { classifyIntent, classifyEventType, chooseChannels, seasonalWeight, demandWeight } from '../src/classify.js';
import {
  buildOpportunities, findStrikingDistance, findLowCtr, findDecay,
  findCompetitorGaps, findUnservedDemand, scoreOpportunity, pathOf,
} from '../src/analyze.js';
import { buildCalendar, calendarToCsv } from '../src/render/calendar.js';
import { renderStandalone } from '../src/render/dashboard.js';
import { deterministicPlan, normalisePlan, synthesizePlan } from '../src/synthesize.js';
import { sampleDataset } from '../fixtures/sample.js';
import { generateKeyPairSync } from 'node:crypto';

let failures = 0;
let checks = 0;

function check(name, actual, expected) {
  checks += 1;
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS  ' : 'FAIL  '}${name}${ok ? '' : `\n        expected: ${expected}\n        actual:   ${actual}`}`);
}

function ok(name, condition, detail = '') {
  check(name, condition ? true : `false ${detail}`, true);
}

function section(title) { console.log(`\n--- ${title} ---`); }

const NOW = new Date('2026-09-10T00:00:00Z');
const data = sampleDataset();

/* ------------------------------------------------------------------ dates */
section('dates');
{
  const windows = comparisonWindows(NOW);
  check('current window ends 3 days back', windows.current.endDate, '2026-09-07');
  check('current window is 90 days', windows.current.startDate, '2026-06-10');
  check('prior window abuts it', windows.prior.endDate, '2026-06-09');
  check('week starts on Monday', isoDate(startOfWeek(new Date('2026-09-10'))), '2026-09-07');
  check('Sunday belongs to the week before', isoDate(startOfWeek(new Date('2026-09-13'))), '2026-09-07');
}

/* ------------------------------------------------------------------- env */
section('environment');
{
  const env = loadEnv({ SEMRUSH_API_KEY: '   ', WIX_API_KEY: 'k', WIX_SITE_ID: 's', ANTHROPIC_API_KEY: 'sk-x' });
  check('whitespace-only key reads as absent', env.semrush.key, 'null');
  check('model defaults to opus 5', env.claude.model, 'claude-opus-5');
  const sources = describeSources(env);
  check('wix counts as ready with both halves', sources.find((s) => s.id === 'wix').ready, 'true');
  check('gsc not ready without a service account', sources.find((s) => s.id === 'gsc').ready, 'false');

  const bad = loadEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: 'not base64 and not json {' });
  ok('malformed service account is reported, not thrown', Boolean(bad.google.serviceAccountError));

  const encoded = Buffer.from(JSON.stringify({ client_email: 'a@b', private_key: 'k' })).toString('base64');
  check('base64 service account decodes', loadEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: encoded }).google.serviceAccount.client_email, 'a@b');
}

/* ------------------------------------------------------------------ http */
section('http');
{
  let attempts = 0;
  const flaky = async () => {
    attempts += 1;
    if (attempts < 3) return { ok: false, status: 503, text: async () => 'busy' };
    return { ok: true, status: 200, text: async () => 'fine' };
  };
  const result = await request('https://example.test', { fetchImpl: flaky, retries: 3 });
  check('retries a 503 until it succeeds', result.body, 'fine');
  check('and stopped as soon as it did', attempts, 3);

  let calls = 0;
  const forbidden = async () => { calls += 1; return { ok: false, status: 403, text: async () => 'nope' }; };
  let raised = null;
  try {
    await request('https://example.test', { fetchImpl: forbidden, retries: 3 });
  } catch (error) { raised = error; }
  ok('a 403 raises', raised instanceof HttpError);
  check('and is not retried', calls, 1);
}

/* ------------------------------------------------------------ connectors */
section('connectors');
{
  const rows = parseSemrushCsv('Keyword;Position;Search Volume\ncatering manila;7;1300\n"quoted;keyword";3;90');
  check('semrush csv parses', rows.length, 2);
  check('semrush honours quoted fields', rows[1].Keyword, 'quoted;keyword');
  check('semrush NOTHING FOUND is an empty result', parseSemrushCsv('ERROR 50 :: NOTHING FOUND').length, 0);

  let semrushError = null;
  try { parseSemrushCsv('ERROR 120 :: WRONG KEY'); } catch (error) { semrushError = error.message; }
  check('semrush error-in-a-200 raises', semrushError, 'Semrush: WRONG KEY');

  const ga4 = shapeReport({
    dimensionHeaders: [{ name: 'pagePath' }, { name: 'dateRange' }],
    metricHeaders: [{ name: 'screenPageViews' }],
    rows: [{ dimensionValues: [{ value: '/a' }, { value: 'current' }], metricValues: [{ value: '12' }] }],
  });
  check('ga4 rows flatten', `${ga4[0].pagePath}/${ga4[0].dateRange}/${ga4[0].screenPageViews}`, '/a/current/12');
  check('ga4 metrics become numbers', typeof ga4[0].screenPageViews, 'number');

  const sheet = rowsToObjects([['Source', 'Leads'], ['Website', '34']]);
  check('sheet rows key by header', sheet[0].Source, 'Website');
  check('empty sheet is an empty list', rowsToObjects([]).length, 0);

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  let tokenCalls = 0;
  const tokenFetch = async () => {
    tokenCalls += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'tok', expires_in: 3600 }) };
  };
  // Escaped newlines are how a PEM survives a GitHub secret.
  const auth = createGoogleAuth(
    { client_email: 'a@b.iam.gserviceaccount.com', private_key: privateKey.replace(/\n/g, '\\n') },
    { fetchImpl: tokenFetch },
  );
  check('jwt exchange returns the token', await auth('scope-a'), 'tok');
  await auth('scope-a');
  check('token is cached per scope', tokenCalls, 1);
  await auth('scope-b');
  check('a different scope re-exchanges', tokenCalls, 2);

  let wixBody = null;
  const wixFetch = async (url, init) => {
    wixBody = JSON.parse(init.body);
    return { ok: true, status: 200, text: async () => JSON.stringify({ posts: [
      { id: '1', title: 'A Post', slug: 'a-post', url: { base: 'https://x.com', path: '/blog/a-post' }, firstPublishedDate: '2025-01-01T00:00:00Z' },
    ] }) };
  };
  const wix = createWixClient({ apiKey: 'k', siteId: 's', fetchImpl: wixFetch });
  const posts = await wix.blogPosts({ limit: 10 });
  check('wix post url is assembled', posts[0].url, 'https://x.com/blog/a-post');
  check('wix paging asks for the limit', wixBody.query.paging.limit, 10);
}

/* -------------------------------------------------------- classification */
section('classification');
{
  check('pricing query is transactional', classifyIntent('wedding catering packages price'), 'transactional');
  check('ideas query is visual', classifyIntent('debut theme ideas'), 'visual');
  check('how-to query is informational', classifyIntent('how to plan a wedding reception'), 'informational');
  check('bare brand query falls back to commercial', classifyIntent('caterer pasig'), 'commercial');

  check('wedding is detected', classifyEventType('church wedding reception catering'), 'Wedding');
  check('18th birthday is a debut', classifyEventType('18th birthday package'), 'Debut');
  check('christmas party is corporate', classifyEventType('company christmas party catering'), 'Corporate');
  check('kiddie party is a kids party', classifyEventType('kiddie party catering manila'), "Kid's Party");
  check('unrelated query has no event type', classifyEventType('catering equipment rental'), 'null');

  const channels = chooseChannels('catering price per head', 'transactional');
  ok('a pricing query earns blog and short video', channels.some((c) => c.channel === 'blog') && channels.some((c) => c.channel === 'shortVideo'));
  ok('but not a long video shoot', !channels.some((c) => c.channel === 'longVideo'));

  const visual = chooseChannels('wedding venue setup ideas', 'visual');
  ok('a visual query earns the walkthrough', visual.some((c) => c.channel === 'longVideo'));

  // September: corporate Christmas parties are being bought; a January
  // private-event reunion is long since booked.
  const corporate = seasonalWeight('Corporate', NOW);
  ok('corporate peaks in September', corporate.multiplier >= 1.5, `got ${corporate.multiplier}`);
  const januaryCorporate = seasonalWeight('Corporate', new Date('2026-01-15'));
  ok('and is demoted in January', januaryCorporate.multiplier < 1, `got ${januaryCorporate.multiplier}`);
  ok('the weighting explains itself', corporate.note.includes('December'));
  check('an unknown event type is neutral', seasonalWeight(null, NOW).multiplier, 1);

  ok('a dominant event type is weighted up', demandWeight('Wedding', data.leads) > 1.2);
  check('demand is neutral with no lead data', demandWeight('Wedding', null), 1);
}

/* --------------------------------------------------------------- analysis */
section('analysis');
{
  check('paths strip host and trailing slash', pathOf('https://x.com/blog/a/'), '/blog/a');
  check('a bare path survives', pathOf('/blog/a'), '/blog/a');

  const striking = findStrikingDistance(data);
  ok('page-two keywords are found', striking.some((o) => o.keyword === 'wedding catering packages'));
  ok('position 1 is not called an opportunity', !striking.some((o) => o.keyword === 'hizons catering'));

  const lowCtr = findLowCtr(data);
  ok('a high-impression low-click query is flagged', lowCtr.some((o) => o.keyword === 'catering price per head philippines'));
  ok('a healthy CTR is not', !lowCtr.some((o) => o.keyword === 'hizons catering'));

  const decayed = findDecay(data);
  ok('the decayed page is caught', decayed.some((o) => o.url.includes('wedding-checklist')));
  ok('a stable page is not', !decayed.some((o) => o.url === 'https://hizonscatering.com/'));
  ok('decay evidence quotes both figures', decayed[0].evidence[0].includes('to'));

  const gaps = findCompetitorGaps(data);
  ok('a keyword only competitors rank for is a gap', gaps.some((o) => o.keyword === 'catering packages for 100 pax'));
  ok('a keyword we already rank for is not', !gaps.some((o) => o.keyword === 'catering services manila'));
  const contested = gaps.find((o) => o.keyword === 'catering packages for 100 pax');
  check('both rivals are named', contested.competitors.length, 2);

  const unserved = findUnservedDemand(data);
  ok('demand with no matching post is flagged', unserved.some((o) => o.keyword === 'christmas party package manila'));

  const high = scoreOpportunity(
    { kind: 'striking-distance', keyword: 'a', volume: 1000, position: 5, eventType: 'Corporate', evidence: [] },
    { leads: data.leads, now: NOW },
  );
  const low = scoreOpportunity(
    { kind: 'unserved-demand', keyword: 'b', volume: 1000, position: null, eventType: 'Corporate', evidence: [] },
    { leads: data.leads, now: NOW },
  );
  ok('a near-miss outranks a cold start at equal volume', high.score > low.score, `${high.score} vs ${low.score}`);

  const opportunities = buildOpportunities(data, { now: NOW, leads: data.leads });
  ok('opportunities are found', opportunities.length > 5, `got ${opportunities.length}`);
  ok('they are ordered by score', opportunities.every((o, i) => i === 0 || opportunities[i - 1].score >= o.score));
  check('no keyword appears twice', new Set(opportunities.map((o) => o.keyword.toLowerCase())).size, opportunities.length);

  const merged = opportunities.find((o) => o.keyword === 'catering price per head philippines');
  ok('a keyword flagged by several detectors is merged', merged.alsoFlaggedAs.length >= 2, JSON.stringify(merged.alsoFlaggedAs));
  ok('and keeps every detector\'s evidence', merged.evidence.length >= 6, `${merged.evidence.length} lines`);
  ok('every opportunity carries evidence', opportunities.every((o) => o.evidence.length > 0));
  ok('every opportunity has a channel', opportunities.every((o) => o.channels.length > 0));

  const empty = buildOpportunities(
    { semrushKeywords: [], competitorKeywords: {}, gscQueries: [], gscPages: [], gscPriorPages: [], gscQueriesByPage: [], blogPosts: [] },
    { now: NOW, leads: null },
  );
  check('no data yields no opportunities rather than a crash', empty.length, 0);
}

/* ------------------------------------------------------------- synthesis */
section('synthesis');
{
  const opportunities = buildOpportunities(data, { now: NOW, leads: data.leads });
  const context = { blogPosts: data.blogPosts, leads: data.leads, today: '2026-09-10', channels: null };

  const fallback = deterministicPlan(opportunities, context);
  ok('the fallback plan has recommendations', fallback.recommendations.length > 0);
  ok('and respects the cap', fallback.recommendations.length <= 18);
  ok('every fallback item names its keyword', fallback.recommendations.every((r) => r.targetKeyword));

  const linked = normalisePlan({
    summary: 'S',
    recommendations: [{ targetKeyword: 'Wedding Catering Packages', channel: 'blog', format: 'guide', title: 'T', angle: 'A', mustInclude: [], assets: [], cta: 'C', priority: 1, effort: 'M', whyNow: 'W' }],
  }, opportunities);
  ok('a recommendation relinks to its evidence case-insensitively', linked.recommendations[0].opportunity !== null);
  const orphan = normalisePlan({
    summary: 'S',
    recommendations: [{ targetKeyword: 'something we never supplied', channel: 'blog', format: 'guide', title: 'T', angle: 'A', mustInclude: [], assets: [], cta: 'C', priority: 1, effort: 'M', whyNow: 'W' }],
  }, opportunities);
  check('an unmatched keyword is kept but marked', orphan.recommendations[0].opportunity, 'null');

  // The Claude path, with the SDK's streaming surface stubbed out.
  const stubClient = (message) => ({
    messages: {
      stream: () => ({ finalMessage: async () => message }),
    },
  });

  const good = await synthesizePlan(opportunities, context, {
    clientImpl: stubClient({
      stop_reason: 'tool_use',
      model: 'claude-opus-5',
      usage: { input_tokens: 10, output_tokens: 20 },
      content: [
        { type: 'thinking', thinking: '' },
        {
          type: 'tool_use',
          name: 'publish_content_plan',
          input: {
            summary: 'Corporate season is live.',
            recommendations: [{
              targetKeyword: 'corporate christmas party catering',
              channel: 'blog', format: 'pricing explainer',
              title: 'What a Company Christmas Party Actually Costs Per Head',
              angle: 'Real figures.', mustInclude: ['per-pax bands'], assets: [],
              cta: 'Request a quotation', priority: 1, effort: 'M', whyNow: 'Budgets approved now.',
            }],
          },
        },
      ],
    }),
  });
  check('a tool call is read as the plan', good.source, 'claude');
  check('and its recommendations come through', good.recommendations.length, 1);
  ok('linked back to the evidence', good.recommendations[0].opportunity !== null);
  check('summary is carried', good.summary, 'Corporate season is live.');

  const refused = await synthesizePlan(opportunities, context, {
    clientImpl: stubClient({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [], usage: {} }),
  });
  check('a refusal degrades to the fallback', refused.source, 'deterministic-after-refusal');
  ok('and still returns a usable plan', refused.recommendations.length > 0);

  const noTool = await synthesizePlan(opportunities, context, {
    clientImpl: stubClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I have thoughts' }], usage: {} }),
  });
  check('an answer without the tool call degrades too', noTool.source, 'deterministic-no-tool-call');

  const broken = await synthesizePlan(opportunities, context, {
    clientImpl: { messages: { stream: () => { throw new Error('network down'); } } },
  });
  check('an API failure degrades', broken.source, 'deterministic-after-error');
  ok('and still returns a usable plan', broken.recommendations.length > 0);

  const noKey = await synthesizePlan(opportunities, context, {});
  check('no API key uses the fallback', noKey.source, 'deterministic');
}

/* -------------------------------------------------------------- calendar */
section('calendar');
{
  const recommendations = [
    { id: 'a', channel: 'longVideo', format: 'venue walkthrough', priority: 1, effort: 'L', title: 'A', targetKeyword: 'a', whyNow: '', mustInclude: [], assets: [], cta: '' },
    { id: 'b', channel: 'longVideo', format: 'venue walkthrough', priority: 2, effort: 'L', title: 'B', targetKeyword: 'b', whyNow: '', mustInclude: [], assets: [], cta: '' },
    { id: 'c', channel: 'blog', format: 'guide', priority: 3, effort: 'M', title: 'C', targetKeyword: 'c', whyNow: '', mustInclude: [], assets: [], cta: '' },
  ];
  const calendar = buildCalendar(recommendations, { now: NOW, horizonWeeks: 4 });
  check('the first week starts the Monday after next', calendar.weeks[0].startDate, '2026-09-14');

  // A venue walkthrough has a 14-day lead time — it has to be filmed — so the
  // week that ends nine days out cannot hold one however urgent it is.
  check('a long video cannot be scheduled inside its lead time', calendar.weeks[0].items.filter((i) => i.channel === 'longVideo').length, 0);
  check('it lands in the first week that clears the lead time', calendar.weeks[1].items.filter((i) => i.channel === 'longVideo').length, 1);
  check('and one a week is respected after that', calendar.weeks[2].items.filter((i) => i.channel === 'longVideo').length, 1);
  ok('the higher-priority video takes the earlier slot', calendar.weeks[1].items[0].id === 'a');
  ok('a blog piece, with a shorter lead time, can go in week one', calendar.weeks[0].items[0].id === 'c');
  ok('every scheduled item has a publish date', calendar.weeks.every((w) => w.items.every((i) => i.publishBy)));

  const overflow = buildCalendar(
    Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, channel: 'longVideo', format: 'x', priority: 1, effort: 'L', title: `V${i}`, targetKeyword: 'k', whyNow: '', mustInclude: [], assets: [], cta: '' })),
    { now: NOW, horizonWeeks: 4 },
  );
  // Three usable weeks at one a week; the lead time rules out the fourth.
  check('overflow lands in the backlog rather than vanishing', overflow.unscheduled.length, 9);
  ok('and says why', overflow.unscheduled[0].reason.includes('capacity'));

  const unknown = buildCalendar([{ id: 'x', channel: 'carrierPigeon', format: 'x', priority: 1, title: 'X', targetKeyword: 'k', whyNow: '', mustInclude: [], assets: [], cta: '' }], { now: NOW });
  check('an unknown channel is set aside, not crashed on', unknown.unscheduled.length, 1);

  const csv = calendarToCsv(calendar);
  const lines = csv.trim().split('\n');
  check('csv has a header plus every item', lines.length, 1 + 3);
  ok('csv quotes every cell', lines[1].startsWith('"'));

  const quoted = calendarToCsv(buildCalendar(
    [{ id: 'q', channel: 'blog', format: 'guide', priority: 1, effort: 'M', title: 'He said "yes", then left', targetKeyword: 'k', whyNow: '', mustInclude: [], assets: [], cta: '' }],
    { now: NOW },
  ));
  ok('a quote inside a cell is doubled', quoted.includes('""yes""'));
}

/* ---------------------------------------------------------------- render */
section('render');
{
  const opportunities = buildOpportunities(data, { now: NOW, leads: data.leads });
  const context = {
    now: NOW, today: '2026-09-10', windows: comparisonWindows(NOW),
    leads: data.leads, blogPosts: data.blogPosts, channels: null,
    sources: describeSources(loadEnv({})), dataErrors: [], horizonWeeks: 4,
    opportunityCount: opportunities.length, planSource: 'deterministic',
  };
  const plan = deterministicPlan(opportunities, context);
  const calendar = buildCalendar(plan.recommendations, { now: NOW });
  context.recommendationCount = plan.recommendations.length;
  context.scheduledCount = calendar.weeks.reduce((sum, w) => sum + w.items.length, 0);

  const html = renderStandalone({ plan, calendar, context });
  ok('the page is a complete document', html.startsWith('<!doctype html>') && html.trim().endsWith('</html>'));
  ok('it names itself', html.includes('<title>What to Publish Next</title>'));
  ok('light tokens are defined on bare :root', /:root \{[^}]*--paper: #FBFAF7/.test(html));
  ok('dark tokens are defined for the un-stamped state', html.includes(':root:not([data-theme="light"])'));
  ok('and for the explicit stamp', html.includes(':root[data-theme="dark"]'));
  ok('body paints its own background', /body \{[^}]*background: var\(--paper\)/.test(html));
  ok('every recommendation is rendered', plan.recommendations.every((r) => html.includes(r.title.replace(/&/g, '&amp;'))));
  ok('the season strip is present', html.includes('season-months'));
  ok('the fallback is disclosed on the page', html.includes('generated without Claude'));

  // Escaping: a title carrying markup must not become markup.
  const nasty = {
    summary: 'x', recommendations: [{
      ...plan.recommendations[0],
      title: '<script>alert(1)</script>', angle: 'A & B', targetKeyword: '"quoted"',
    }],
  };
  const escaped = renderStandalone({
    plan: nasty, calendar: buildCalendar(nasty.recommendations, { now: NOW }), context,
  });
  ok('markup in content is escaped', !escaped.includes('<script>alert(1)</script>'));
  ok('and rendered as text', escaped.includes('&lt;script&gt;'));
  ok('ampersands are escaped', escaped.includes('A &amp; B'));
}

console.log(`\n${failures ? `${failures} of ${checks} CHECKS FAILED` : `All ${checks} checks passed.`}`);
process.exit(failures ? 1 : 0);

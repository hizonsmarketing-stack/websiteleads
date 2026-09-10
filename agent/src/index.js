/**
 * The run.
 *
 *   gather -> analyse -> synthesise -> render
 *
 * Gathering is the only part that can partially fail, and it is allowed to:
 * every connector returns its errors rather than throwing, and the run
 * proceeds with whatever arrived. What the dashboard then shows is which
 * sources were live, so a plan built on two of them is never mistaken for a
 * plan built on five.
 *
 *   node src/index.js              # live, using whatever credentials exist
 *   node src/index.js --offline    # fixtures only, no network
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUSINESS, PLAN } from './config.js';
import { describeSources, loadEnv } from './env.js';
import { comparisonWindows, isoDate } from './dates.js';
import { buildOpportunities } from './analyze.js';
import { synthesizePlan } from './synthesize.js';
import { buildCalendar, calendarToCsv } from './render/calendar.js';
import { renderStandalone, renderArtifact } from './render/dashboard.js';

import { createGoogleAuth } from './connectors/google-auth.js';
import { fetchSemrush } from './connectors/semrush.js';
import { fetchSearchConsole } from './connectors/gsc.js';
import { fetchGa4 } from './connectors/ga4.js';
import { fetchWix } from './connectors/wix.js';
import { fetchLeads } from './connectors/leads.js';
import { sampleDataset } from '../fixtures/sample.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'output');

function makeLogger() {
  const lines = [];
  return {
    lines,
    log(message) {
      const stamped = `[${new Date().toISOString().slice(11, 19)}] ${message}`;
      lines.push(stamped);
      console.log(stamped);
    },
  };
}

/**
 * Pulls every configured source. Sources without credentials are skipped
 * silently — `describeSources` has already recorded that they are off, and
 * repeating it per source would bury the real errors.
 */
export async function gather({ env, windows, log, offline }) {
  if (offline) {
    log('Offline mode — using fixtures.');
    return { ...sampleDataset(), errors: [] };
  }

  const errors = [];
  const data = {
    semrushKeywords: [], competitorKeywords: {}, competitors: [],
    gscQueries: [], gscPages: [], gscPriorPages: [], gscQueriesByPage: [],
    ga4Pages: [], ga4Channels: [], ga4LandingPages: [],
    blogPosts: [], leads: null,
  };

  if (env.google.serviceAccountError) errors.push(`Google credentials: ${env.google.serviceAccountError}`);

  const getAccessToken = env.google.serviceAccount
    ? createGoogleAuth(env.google.serviceAccount)
    : null;

  // Independent of one another, so they run together — the run is dominated by
  // waiting on four different companies' APIs.
  const jobs = [];

  if (env.semrush.key) {
    jobs.push(fetchSemrush({
      apiKey: env.semrush.key,
      database: env.semrush.database || BUSINESS.semrushDatabase,
      domain: env.domain || BUSINESS.domain,
      log,
    }).then((result) => {
      data.semrushKeywords = result.keywords;
      data.competitorKeywords = result.competitorKeywords;
      data.competitors = result.competitors;
      errors.push(...result.errors.map((e) => `Semrush ${e}`));
    }));
  }

  if (getAccessToken && env.google.searchConsoleSite) {
    jobs.push(fetchSearchConsole({
      getAccessToken, siteUrl: env.google.searchConsoleSite, windows, log,
    }).then((result) => {
      data.gscQueries = result.queries;
      data.gscPages = result.pages;
      data.gscPriorPages = result.priorPages;
      data.gscQueriesByPage = result.queriesByPage;
      errors.push(...result.errors.map((e) => `Search Console ${e}`));
    }));
  }

  if (getAccessToken && env.google.ga4PropertyId) {
    jobs.push(fetchGa4({
      getAccessToken, propertyId: env.google.ga4PropertyId, windows, log,
    }).then((result) => {
      data.ga4Pages = result.pages;
      data.ga4Channels = result.channels;
      data.ga4LandingPages = result.landingPages;
      errors.push(...result.errors.map((e) => `GA4 ${e}`));
    }));
  }

  if (env.wix.apiKey && env.wix.siteId) {
    jobs.push(fetchWix({
      apiKey: env.wix.apiKey, siteId: env.wix.siteId, accountId: env.wix.accountId,
      analyticsPath: process.env.WIX_ANALYTICS_PATH, windows, log,
    }).then((result) => {
      data.blogPosts = result.blogPosts;
      errors.push(...result.errors.map((e) => `Wix ${e}`));
    }));
  }

  if (getAccessToken && env.google.leadsSpreadsheetId) {
    jobs.push(fetchLeads({
      spreadsheetId: env.google.leadsSpreadsheetId, getAccessToken, windows, log,
    }).then((result) => {
      data.leads = result;
      errors.push(...result.errors.map((e) => `Leads ${e}`));
    }));
  }

  await Promise.all(jobs);
  return { ...data, errors };
}

/** GA4's channel report, reduced to the one line the prompt needs. */
function summariseChannels(ga4Channels) {
  if (!ga4Channels?.length) return null;
  const total = ga4Channels.reduce((sum, row) => sum + (row.sessions || 0), 0) || 1;
  return ga4Channels
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 6)
    .map((row) => ({
      channel: row.sessionDefaultChannelGroup,
      sessionShare: `${Math.round((row.sessions / total) * 100)}%`,
      conversions: row.keyEvents,
    }));
}

export async function run({ argv = [], envSource = process.env, now = new Date() } = {}) {
  const { log, lines } = makeLogger();
  const offline = argv.includes('--offline');
  const env = loadEnv(envSource);
  const sources = describeSources(env);
  const windows = comparisonWindows(now);

  log(`Content agent starting for ${env.domain || BUSINESS.domain}${offline ? ' (offline)' : ''}.`);
  const live = sources.filter((source) => source.ready).map((source) => source.label);
  log(offline ? 'Sources: fixtures' : `Sources live: ${live.join(', ') || 'none — the run will be empty'}`);

  const data = await gather({ env, windows, log, offline });

  const opportunities = buildOpportunities(data, { now, leads: data.leads });
  log(`Analysis found ${opportunities.length} opportunities worth acting on.`);

  if (!opportunities.length) {
    log('Nothing to plan. This usually means no source returned data — check the credentials above.');
  }

  const context = {
    now,
    today: isoDate(now),
    windows,
    leads: data.leads,
    blogPosts: data.blogPosts,
    channels: summariseChannels(data.ga4Channels),
    sources: offline
      ? sources.map((source) => ({ ...source, ready: false, missing: 'offline run' }))
      : sources,
    dataErrors: data.errors,
    horizonWeeks: PLAN.horizonWeeks,
    opportunityCount: opportunities.length,
  };

  const plan = await synthesizePlan(opportunities, context, {
    apiKey: env.claude.apiKey,
    model: env.claude.model,
    log,
  });

  const calendar = buildCalendar(plan.recommendations, { now });

  context.planSource = plan.source;
  context.recommendationCount = plan.recommendations.length;
  context.scheduledCount = calendar.weeks.reduce((sum, week) => sum + week.items.length, 0);

  await mkdir(OUT_DIR, { recursive: true });
  const written = {
    'dashboard.html': renderStandalone({ plan, calendar, context }),
    'dashboard.fragment.html': renderArtifact({ plan, calendar, context }),
    'content-calendar.csv': calendarToCsv(calendar),
    'insights.json': `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      domain: env.domain || BUSINESS.domain,
      windows,
      planSource: plan.source,
      summary: plan.summary,
      opportunities,
      recommendations: plan.recommendations,
      calendar,
      sources: context.sources,
      dataErrors: data.errors,
    }, null, 2)}\n`,
    'run.log': `${lines.join('\n')}\n`,
  };

  for (const [name, content] of Object.entries(written)) {
    await writeFile(resolve(OUT_DIR, name), content, 'utf8');
  }

  log(`Wrote ${Object.keys(written).length} files to agent/output/.`);
  log(`Plan: ${plan.recommendations.length} recommendations, ${context.scheduledCount} scheduled, ${calendar.unscheduled.length} in backlog.`);

  return { plan, calendar, opportunities, context, data };
}

// Only when executed directly, so the tests can import `run` freely.
if (process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`) {
  run({ argv: process.argv.slice(2) }).catch((error) => {
    console.error(`Content agent failed: ${error.stack || error.message}`);
    process.exit(1);
  });
}

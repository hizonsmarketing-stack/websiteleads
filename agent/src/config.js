/**
 * Every tuning knob the content agent has.
 *
 * Nothing here is a secret. Secrets come from the environment (see env.js);
 * this file is the business context — who we are, what we sell, when we sell
 * it, and what counts as an opportunity worth acting on.
 */

/** The business the agent is writing for. Feeds the brief-writing prompt. */
export const BUSINESS = {
  name: "Hizon's Catering",
  domain: 'hizonscatering.com',
  market: 'Metro Manila, Philippines',
  semrushDatabase: 'ph',
  language: 'en-PH',
  /** Said in the first person, because the model writes as us. */
  positioning:
    'A full-service events caterer in Metro Manila. We cater weddings, ' +
    'debuts, corporate functions, kids\' parties and private events, and we ' +
    'work across partner venues as well as client-chosen locations. Our ' +
    'buyers are researching venue + catering together, comparing packages by ' +
    'headcount and budget, and they are planning three to twelve months out.',
  /** The event types the lead system already routes to. Kept in sync deliberately. */
  eventTypes: ['Wedding', 'Debut', "Kid's Party", 'Corporate', 'Private Event'],
};

/**
 * The channels we publish on, and what each one is actually good at.
 *
 * `intents` is the list of search-intent labels that suit this channel, and it
 * is how a keyword opportunity gets matched to a format without asking the
 * model to guess. `capacity` is how many pieces per week the team can realistically
 * ship — it caps the calendar so the plan stays a plan and not a wish list.
 */
export const CHANNELS = {
  blog: {
    label: 'Wix blog / long-form page',
    formats: ['guide', 'checklist', 'comparison', 'pricing explainer', 'real event write-up'],
    intents: ['informational', 'commercial', 'transactional'],
    capacity: 2,
    leadTimeDays: 7,
    /** Long-form is the only channel that ranks, so it owns the keyword targets. */
    ranksInSearch: true,
  },
  shortVideo: {
    label: 'Short-form video (Reels / TikTok / Shorts)',
    formats: ['hook explainer', 'before-after', 'menu reveal', 'setup timelapse', 'myth-buster', 'price breakdown'],
    intents: ['informational', 'visual', 'commercial'],
    capacity: 3,
    leadTimeDays: 3,
    ranksInSearch: false,
  },
  longVideo: {
    label: 'Long-form video (YouTube)',
    formats: ['venue walkthrough', 'full event film', 'tasting session', 'planning Q&A', 'package deep-dive'],
    intents: ['visual', 'informational', 'commercial'],
    capacity: 1,
    leadTimeDays: 14,
    ranksInSearch: false,
  },
};

/**
 * When each event type is actually being searched and booked in the Philippines.
 *
 * Months are 1-12. `leadMonths` is how far ahead people book, so a topic is
 * promoted when we are inside the booking window, not the event window — a
 * December corporate party is bought in September.
 */
export const SEASONALITY = [
  { eventType: 'Corporate', peakMonths: [11, 12], leadMonths: 3, note: 'Company Christmas parties. Budget is approved Aug-Oct.' },
  { eventType: 'Wedding', peakMonths: [12, 1, 2, 5, 6], leadMonths: 8, note: 'Cool-season and June weddings. Long research cycle.' },
  { eventType: 'Debut', peakMonths: [3, 4, 5, 10], leadMonths: 5, note: 'Clusters around school breaks.' },
  { eventType: "Kid's Party", peakMonths: [3, 4, 10, 11, 12], leadMonths: 2, note: 'Short lead time, impulse-adjacent.' },
  { eventType: 'Private Event', peakMonths: [12, 1], leadMonths: 2, note: 'Reunions and homecomings around the holidays.' },
];

/** What makes a keyword worth acting on. */
export const THRESHOLDS = {
  /** Positions 4-20: we already rank, so a rewrite can move us onto page one. */
  strikingDistance: { minPosition: 4, maxPosition: 20, minVolume: 50 },
  /** Search Console says people see us and don't click. A title problem, not a content problem. */
  lowCtr: { minImpressions: 200, maxCtr: 0.02 },
  /** A page that has lost this much of its traffic is a refresh candidate. */
  decay: { windowDays: 90, minDropRatio: 0.3, minPriorClicks: 30 },
  /** Competitors ranking top-10 for something we don't rank for at all. */
  gap: { competitorMaxPosition: 10, minVolume: 100 },
  /** Below this we assume the keyword is too thin to build a piece around. */
  minVolumeAnywhere: 20,
};

/** How many recommendations to carry through to the brief-writing stage. */
export const PLAN = {
  /** Opportunities handed to the model. More costs more and adds noise. */
  shortlistSize: 24,
  /** Weeks of calendar to lay out. */
  horizonWeeks: 4,
  /** Recommendations to publish, across all channels. */
  maxRecommendations: 18,
};

/**
 * Search intent, inferred from the shape of the query.
 *
 * Ordered: the first pattern that matches wins, so put the specific ones first.
 * This is deliberately not an LLM call — it runs over thousands of keywords and
 * needs to be free, instant and identical between runs.
 */
export const INTENT_PATTERNS = [
  { intent: 'transactional', test: /\b(package|packages|rates?|price|pricing|cost|quote|booking|book|hire|per head|per pax|budget)\b/i },
  { intent: 'visual', test: /\b(ideas?|themes?|inspiration|motif|design|decor|setup|photos?|look|styles?|venue tour|walkthrough)\b/i },
  { intent: 'informational', test: /\b(how|what|when|why|which|guide|checklist|tips?|planning|plan|etiquette|timeline|vs\.?|versus|difference)\b/i },
  { intent: 'commercial', test: /\b(best|top|near me|in manila|in metro manila|affordable|cheap|review|recommended)\b/i },
];

/** Fallback when nothing matches. Commercial is the safe middle. */
export const DEFAULT_INTENT = 'commercial';

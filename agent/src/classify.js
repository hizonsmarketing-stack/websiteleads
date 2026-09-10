/**
 * Turning a keyword into a channel and a format.
 *
 * All of this is rules, not model calls. It runs over several thousand
 * keywords per run, it has to give the same answer twice, and "does this
 * query want a video or an article" is a question a regex answers as well as
 * anything — the model's judgement is worth paying for at the brief-writing
 * stage, not here.
 */

import { CHANNELS, DEFAULT_INTENT, INTENT_PATTERNS, BUSINESS, SEASONALITY } from './config.js';

/** Which of our event types a keyword is about, if any. */
const EVENT_PATTERNS = [
  { eventType: 'Wedding', test: /\b(wedding|bride|groom|nuptial|reception|engagement|wedd)\b/i },
  { eventType: 'Debut', test: /\b(debut|18th|cotillion|eighteenth)\b/i },
  { eventType: "Kid's Party", test: /\b(kid|kids|kiddie|children|birthday party|christening|baptism|first birthday)\b/i },
  { eventType: 'Corporate', test: /\b(corporate|company|office|christmas party|year.?end|conference|seminar|team.?building|product launch|inaugural)\b/i },
  { eventType: 'Private Event', test: /\b(reunion|anniversary|despedida|homecoming|private|family gathering|birthday)\b/i },
];

export function classifyIntent(keyword) {
  for (const { intent, test } of INTENT_PATTERNS) {
    if (test.test(keyword)) return intent;
  }
  return DEFAULT_INTENT;
}

export function classifyEventType(keyword) {
  for (const { eventType, test } of EVENT_PATTERNS) {
    if (test.test(keyword)) return eventType;
  }
  return null;
}

/**
 * The channel a keyword should be served by, and why.
 *
 * A keyword that ranks belongs to long-form first — it is the only channel
 * that can capture the search. Video channels are chosen for the topics where
 * the answer is something you have to *see*: a room set up, a buffet laid out,
 * a portion size.
 */
export function chooseChannels(keyword, intent) {
  const chosen = [];

  // Anything with search volume behind it gets a long-form home, because
  // that's the only asset that keeps earning the click after we stop posting.
  chosen.push({
    channel: 'blog',
    format: formatForBlog(keyword, intent),
    rationale: 'Long-form is the only channel that can rank for this query.',
  });

  if (intent === 'visual' || /\b(setup|decor|buffet|spread|venue|styling|motif|theme|package inclusions)\b/i.test(keyword)) {
    chosen.push({
      channel: 'longVideo',
      format: 'venue walkthrough',
      rationale: 'The query asks what something looks like, which a walkthrough answers better than prose.',
    });
  }

  if (intent === 'transactional' || /\b(cost|price|per head|per pax|budget|package)\b/i.test(keyword)) {
    chosen.push({
      channel: 'shortVideo',
      format: 'price breakdown',
      rationale: 'Pricing questions travel well as short video and pull comments that become enquiries.',
    });
  } else if (intent === 'informational') {
    chosen.push({
      channel: 'shortVideo',
      format: 'hook explainer',
      rationale: 'A single-question explainer, cut from the long-form piece at no extra shoot cost.',
    });
  }

  return chosen;
}

function formatForBlog(keyword, intent) {
  if (intent === 'transactional') return 'pricing explainer';
  if (/\bvs\.?\b|\bversus\b|\bdifference\b|\bbest\b|\btop\b/i.test(keyword)) return 'comparison';
  if (/\bchecklist\b|\btimeline\b|\bsteps?\b/i.test(keyword)) return 'checklist';
  if (intent === 'visual') return 'real event write-up';
  return 'guide';
}

/**
 * How much to weight a topic for the time of year.
 *
 * The naive version of this measures how close the peak month is, and in a
 * Philippine events business that scores everything in Q4 identically —
 * weddings, debuts, kids' parties and company Christmas parties all peak
 * within weeks of each other, so "close to the peak" ranks nothing.
 *
 * What actually matters is the distance to the moment the buyer decides,
 * which is `leadMonths` *before* the peak. A December wedding is largely
 * booked by September; a May one is being decided right now. So we score the
 * deviation from that ideal, on a curve whose width is set by how long the
 * booking window for that event type is — a two-month kids' party window is
 * unforgiving, an eight-month wedding window is not.
 */
export function seasonalWeight(eventType, now) {
  const season = SEASONALITY.find((entry) => entry.eventType === eventType);
  if (!season) return { multiplier: 1, note: null, targetPeak: null };

  const month = new Date(now).getUTCMonth() + 1;

  let best = null;
  for (const peak of season.peakMonths) {
    const monthsToPeak = (peak - month + 12) % 12;
    const deviation = Math.abs(monthsToPeak - season.leadMonths);
    if (!best || deviation < best.deviation) best = { peak, monthsToPeak, deviation };
  }

  // Wider booking windows forgive more slippage. The 1/3 keeps a two-month
  // window tight without letting sigma fall below a single month, which would
  // make the curve a cliff.
  const sigma = Math.max(1, season.leadMonths / 3);
  const closeness = Math.exp(-(best.deviation ** 2) / (2 * sigma ** 2));
  const multiplier = Number((0.7 + 0.9 * closeness).toFixed(2));

  const peakName = MONTH_NAMES[best.peak - 1];
  const phrase = EVENT_PHRASES[eventType] || `${eventType.toLowerCase()} events`;
  const note = best.deviation <= 1
    ? `Buyers for ${peakName} ${phrase} are choosing a caterer now. ${season.note}`
    : best.monthsToPeak < season.leadMonths
      ? `Late for ${peakName} — most ${phrase} for it are already booked. ${season.note}`
      : `Early for ${peakName} ${phrase}; publish now and it will be ranking when they start looking. ${season.note}`;

  return { multiplier, note, targetPeak: peakName };
}

/** Plural forms, so a note reads as English rather than as a template. */
const EVENT_PHRASES = {
  Wedding: 'weddings',
  Debut: 'debuts',
  "Kid's Party": "kids' parties",
  Corporate: 'corporate events',
  'Private Event': 'private events',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * How much the business actually cares about this event type, learned from the
 * lead sheet rather than assumed. An event type that produced a quarter of
 * last quarter's enquiries earns more than one that produced none.
 */
export function demandWeight(eventType, leads) {
  if (!leads || !leads.total || !eventType) return 1;
  const share = (leads.byEventType[eventType] || 0) / leads.total;
  // Range roughly 0.8 to 1.5. Deliberately gentle: the lead sheet reflects
  // what we already win, and leaning on it too hard would keep us out of
  // every market we have not entered yet.
  return 0.8 + Math.min(share, 0.35) * 2;
}

export const CHANNEL_IDS = Object.keys(CHANNELS);
export const BUSINESS_EVENT_TYPES = BUSINESS.eventTypes;

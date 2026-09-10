/**
 * Turning scored opportunities into things a person can actually go and make.
 *
 * The model is given no arithmetic to do. Every number it sees — volume,
 * position, score, seasonal weighting — was computed in `analyze.js` and is
 * handed over as fact. What it is asked for is the part that genuinely needs
 * judgement: what the piece should say, what angle beats the competitor
 * already ranking, and what has to be shot or gathered to make it.
 *
 * If there is no API key, or the call fails, `deterministicPlan` produces a
 * usable plan from the same data. A weekly automation that dies because a
 * third party had a bad morning is worse than one that degrades.
 */

import Anthropic from '@anthropic-ai/sdk';
import { BUSINESS, CHANNELS, PLAN } from './config.js';

const TOOL_NAME = 'publish_content_plan';

/** Strict schema, so the arguments come back validated rather than hopefully-shaped. */
const PLAN_TOOL = {
  name: TOOL_NAME,
  description:
    'Publish the finished content plan. Call this exactly once, with one entry per ' +
    'piece of content you are recommending.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'recommendations'],
    properties: {
      summary: {
        type: 'string',
        description:
          'Two or three sentences for the top of the dashboard: what this week\'s data says ' +
          'and what the team should concentrate on. Written for the marketing lead, not for an analyst.',
      },
      recommendations: {
        type: 'array',
        description: 'One entry per piece of content, strongest first.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['targetKeyword', 'channel', 'format', 'title', 'angle', 'mustInclude', 'assets', 'cta', 'priority', 'effort', 'whyNow'],
          properties: {
            targetKeyword: {
              type: 'string',
              description: 'The keyword from the supplied opportunities that this piece targets. Copy it exactly.',
            },
            channel: { type: 'string', enum: ['blog', 'shortVideo', 'longVideo'] },
            format: { type: 'string', description: 'One of the formats listed for that channel.' },
            title: {
              type: 'string',
              description:
                'For a blog piece, the headline as it would be published. For video, the on-screen hook — ' +
                'the first line the viewer hears. Concrete and specific; no placeholders.',
            },
            angle: {
              type: 'string',
              description:
                'One sentence on what makes this worth watching or reading when competitors already cover the topic.',
            },
            mustInclude: {
              type: 'array',
              items: { type: 'string' },
              description: 'Three to five specific points, figures or sections the piece has to contain.',
            },
            assets: {
              type: 'array',
              items: { type: 'string' },
              description:
                'What has to be shot, photographed or gathered before this can be made — named concretely, ' +
                'e.g. "buffet setup at the Quezon City venue, wide and close".',
            },
            cta: { type: 'string', description: 'The call to action, matched to how ready the viewer is to buy.' },
            priority: { type: 'integer', minimum: 1, maximum: 5, description: '1 is highest.' },
            effort: { type: 'string', enum: ['S', 'M', 'L'] },
            whyNow: {
              type: 'string',
              description:
                'The evidence, in a sentence a non-technical reader believes: cite the position, the ' +
                'traffic drop, the competitor or the season that makes this urgent.',
            },
          },
        },
      },
    },
  },
};

function systemPrompt() {
  const channelLines = Object.entries(CHANNELS)
    .map(([id, channel]) => `- ${id} (${channel.label}): formats ${channel.formats.join(', ')}. About ${channel.capacity} pieces a week is realistic.`)
    .join('\n');

  return `You plan content for ${BUSINESS.name}, ${BUSINESS.market}.

${BUSINESS.positioning}

The event types the sales team is organised around: ${BUSINESS.eventTypes.join(', ')}.

Channels available:
${channelLines}

You will be given opportunities already found and scored from Search Console, Semrush, Google Analytics and the company's own lead records. The numbers are established fact — do not recompute, question or restate them at length. Your job is the editorial judgement: what each piece should say, and what angle wins against competitors already covering the topic.

How to plan well here:

- Recommend the piece the evidence supports. A keyword we rank 11th for needs the existing page improved, not a new one. A page that lost traffic needs a refresh with a stated reason. A competitor gap needs something better than what already ranks, and you should say what "better" means concretely.
- Earn the shoot. Video is expensive, so only recommend it where seeing the thing is the point — a room set up, portion sizes, a buffet line. Where a short video can be cut from a blog piece you are already recommending, say so in the assets, so it costs one shoot rather than two.
- Be specific to catering in the Philippines. "Per pax" pricing, venue partnerships, the December corporate-party rush, Filipino menu expectations. A brief that would suit any caterer anywhere is a brief nobody can film.
- Titles are final copy. Write the headline that gets published, not a description of it. No brackets, no "How to [topic]".
- Respect the weekly capacity figures. Roughly ${PLAN.maxRecommendations} pieces across about ${PLAN.horizonWeeks} weeks, weighted towards the channels that can absorb them.
- Assign priority on business impact, not on search volume alone. An enquiry for a wedding is worth more than a click.`;
}

/** Compact enough to keep the request cheap, complete enough to reason from. */
function opportunityBrief(opportunities, context) {
  return JSON.stringify({
    generatedFor: context.today,
    leadMix: context.leads?.total
      ? {
          totalLeadsInWindow: context.leads.total,
          byEventType: context.leads.byEventType,
          note: 'Enquiries the business actually received in the same period, by event type.',
        }
      : 'No lead data available this run.',
    trafficMix: context.channels,
    existingContent: context.blogPosts.map((post) => ({ title: post.title, published: post.publishedAt?.slice(0, 10) })),
    opportunities: opportunities.map((item) => ({
      keyword: item.keyword,
      finding: item.kind,
      alsoFlaggedAs: item.alsoFlaggedAs,
      monthlyVolume: item.volume,
      ourPosition: item.position,
      eventType: item.eventType,
      searchIntent: item.intent,
      priorityScore: item.score,
      seasonalContext: item.seasonNote,
      existingUrl: item.url || null,
      competitors: item.competitors,
      evidence: item.evidence,
      suggestedChannels: item.channels.map((c) => `${c.channel}/${c.format}`),
    })),
  }, null, 1);
}

export async function synthesizePlan(opportunities, context, { apiKey, model, clientImpl, log = () => {} } = {}) {
  if (!apiKey && !clientImpl) {
    log('No ANTHROPIC_API_KEY — falling back to the deterministic plan.');
    return { ...deterministicPlan(opportunities, context), source: 'deterministic' };
  }

  const client = clientImpl || new Anthropic({ apiKey });

  try {
    // Streamed because the plan runs to a few thousand tokens and a
    // non-streaming request that size flirts with the HTTP timeout.
    const stream = client.messages.stream({
      model: model || 'claude-opus-5',
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: systemPrompt(),
      tools: [PLAN_TOOL],
      messages: [{
        role: 'user',
        content:
          `Here is this week's analysis.\n\n${opportunityBrief(opportunities, context)}\n\n` +
          `Work through which of these deserve content and what each piece should be, then call ` +
          `${TOOL_NAME} once with the finished plan.`,
      }],
    });

    const response = await stream.finalMessage();

    if (response.stop_reason === 'refusal') {
      log(`Claude declined the request (${response.stop_details?.category ?? 'no category'}) — using the deterministic plan.`);
      return { ...deterministicPlan(opportunities, context), source: 'deterministic-after-refusal' };
    }

    const call = response.content.find((block) => block.type === 'tool_use' && block.name === TOOL_NAME);
    if (!call) {
      log('Claude answered without calling the plan tool — using the deterministic plan.');
      return { ...deterministicPlan(opportunities, context), source: 'deterministic-no-tool-call' };
    }

    const plan = normalisePlan(call.input, opportunities);
    log(`Claude returned ${plan.recommendations.length} recommendations (${response.usage.input_tokens} in, ${response.usage.output_tokens} out).`);
    return { ...plan, source: 'claude', usage: response.usage, model: response.model };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) log('Anthropic rejected the API key.');
    else if (error instanceof Anthropic.RateLimitError) log('Anthropic rate limit hit.');
    else if (error instanceof Anthropic.APIError) log(`Anthropic error ${error.status}: ${error.message}`);
    else log(`Synthesis failed: ${error.message}`);
    return { ...deterministicPlan(opportunities, context), source: 'deterministic-after-error', error: error.message };
  }
}

/**
 * Re-attaches each recommendation to the opportunity that justified it, so the
 * dashboard can show the evidence next to the brief. A recommendation whose
 * keyword doesn't match anything we supplied is kept, but marked — better a
 * visible oddity than a silent drop.
 */
export function normalisePlan(input, opportunities) {
  const byKeyword = new Map(opportunities.map((item) => [item.keyword.toLowerCase().trim(), item]));

  const recommendations = (input.recommendations || []).map((rec, index) => {
    const match = byKeyword.get(String(rec.targetKeyword || '').toLowerCase().trim());
    return {
      id: `rec-${index + 1}`,
      ...rec,
      mustInclude: rec.mustInclude || [],
      assets: rec.assets || [],
      opportunity: match
        ? {
            kind: match.kind,
            volume: match.volume,
            position: match.position,
            score: match.score,
            eventType: match.eventType,
            evidence: match.evidence,
            url: match.url,
            seasonNote: match.seasonNote,
          }
        : null,
    };
  });

  return { summary: input.summary || '', recommendations };
}

/**
 * The plan you get with no model involved.
 *
 * Mechanical, and it reads that way, but every field is filled from real data
 * and the priorities are the same ones the scoring produced — so an offline
 * run, or a run on the morning Anthropic is having an outage, still ships a
 * calendar the team can work from.
 */
export function deterministicPlan(opportunities, context) {
  const recommendations = [];

  for (const item of opportunities) {
    for (const channel of item.channels) {
      if (recommendations.length >= PLAN.maxRecommendations) break;

      const verb = item.kind === 'striking-distance' || item.kind === 'decay' || item.kind === 'low-ctr'
        ? 'Rework'
        : 'Create';

      recommendations.push({
        id: `rec-${recommendations.length + 1}`,
        targetKeyword: item.keyword,
        channel: channel.channel,
        format: channel.format,
        title: `${verb}: ${item.keyword.replace(/\b\w/g, (c) => c.toUpperCase())}`,
        angle: channel.rationale,
        mustInclude: item.evidence.slice(0, 3),
        assets: channel.channel === 'blog' ? [] : ['To be scoped — no brief generated without Claude.'],
        cta: item.intent === 'transactional' ? 'Request a quotation' : 'Download the planning guide',
        priority: Math.min(5, Math.max(1, 6 - Math.ceil(item.score / 30))),
        effort: channel.channel === 'longVideo' ? 'L' : channel.channel === 'blog' ? 'M' : 'S',
        whyNow: item.seasonNote || item.evidence[0] || '',
        opportunity: {
          kind: item.kind,
          volume: item.volume,
          position: item.position,
          score: item.score,
          eventType: item.eventType,
          evidence: item.evidence,
          url: item.url,
          seasonNote: item.seasonNote,
        },
      });
    }
  }

  const top = opportunities.slice(0, 3).map((item) => item.keyword).join(', ');
  return {
    summary:
      `${opportunities.length} opportunities found across Search Console, Semrush and site analytics. ` +
      `The strongest are ${top}. This plan was generated without Claude, so the briefs are mechanical — ` +
      `set ANTHROPIC_API_KEY for written briefs.`,
    recommendations,
  };
}

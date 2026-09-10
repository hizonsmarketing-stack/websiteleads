/**
 * A plausible three months of data for a Metro Manila caterer.
 *
 * This is what `--offline` runs against. It exists so the pipeline can be
 * developed, tested and demonstrated before anybody has signed up for a
 * Semrush plan, and so the test suite has something stable to assert on.
 *
 * The numbers are invented but the shapes are real: page-two rankings on the
 * money terms, a decayed post, competitors holding the head terms, and the
 * seasonal Christmas-party demand that shows up in a Philippine Q4.
 */

export const semrushKeywords = [
  { keyword: 'catering services manila', position: 6, previousPosition: 9, volume: 2400, cpc: 1.1, url: 'https://hizonscatering.com/', trafficShare: 12, competition: 0.4, results: 900000 },
  { keyword: 'wedding catering packages', position: 11, previousPosition: 11, volume: 1600, cpc: 1.4, url: 'https://hizonscatering.com/weddings', trafficShare: 4, competition: 0.6, results: 500000 },
  { keyword: 'debut catering package', position: 8, previousPosition: 14, volume: 720, cpc: 0.9, url: 'https://hizonscatering.com/debut', trafficShare: 3, competition: 0.5, results: 210000 },
  { keyword: 'catering price per head philippines', position: 14, previousPosition: 12, volume: 1900, cpc: 1.2, url: 'https://hizonscatering.com/blog/catering-cost', trafficShare: 2, competition: 0.7, results: 640000 },
  { keyword: 'corporate christmas party catering', position: 17, previousPosition: 22, volume: 880, cpc: 1.8, url: '', trafficShare: 1, competition: 0.8, results: 310000 },
  { keyword: 'hizons catering', position: 1, previousPosition: 1, volume: 3600, cpc: 0.2, url: 'https://hizonscatering.com/', trafficShare: 40, competition: 0.1, results: 12000 },
  { keyword: 'buffet catering metro manila', position: 9, previousPosition: 10, volume: 1100, cpc: 1.0, url: 'https://hizonscatering.com/buffet', trafficShare: 3, competition: 0.5, results: 420000 },
  { keyword: 'kiddie party catering', position: 19, previousPosition: 19, volume: 590, cpc: 0.7, url: '', trafficShare: 0.5, competition: 0.4, results: 180000 },
];

export const competitorKeywords = {
  'competitor-a.com.ph': [
    { keyword: 'wedding venue with catering manila', position: 3, volume: 1300, url: 'https://competitor-a.com.ph/wedding-venues' },
    { keyword: 'catering packages for 100 pax', position: 4, volume: 1750, url: 'https://competitor-a.com.ph/100-pax' },
    { keyword: 'catering services manila', position: 2, volume: 2400, url: 'https://competitor-a.com.ph/' },
    { keyword: 'affordable catering manila', position: 6, volume: 980, url: 'https://competitor-a.com.ph/affordable' },
  ],
  'competitor-b.ph': [
    { keyword: 'catering packages for 100 pax', position: 7, volume: 1750, url: 'https://competitor-b.ph/packages' },
    { keyword: 'christmas party package manila', position: 5, volume: 2100, url: 'https://competitor-b.ph/christmas' },
    { keyword: 'wedding venue with catering manila', position: 9, volume: 1300, url: 'https://competitor-b.ph/venues' },
  ],
};

export const competitors = [
  { domain: 'competitor-a.com.ph', relevance: 0.82, commonKeywords: 430, organicKeywords: 2100, organicTraffic: 18400 },
  { domain: 'competitor-b.ph', relevance: 0.71, commonKeywords: 310, organicKeywords: 1650, organicTraffic: 11200 },
];

export const gscQueries = [
  { query: 'wedding catering packages', clicks: 41, impressions: 3800, ctr: 0.0108, position: 11.4 },
  { query: 'catering price per head philippines', clicks: 22, impressions: 4100, ctr: 0.0054, position: 14.2 },
  { query: 'catering services manila', clicks: 180, impressions: 6200, ctr: 0.029, position: 6.1 },
  { query: 'corporate christmas party catering', clicks: 9, impressions: 1450, ctr: 0.0062, position: 17.8 },
  { query: 'debut catering package', clicks: 60, impressions: 1900, ctr: 0.0316, position: 8.3 },
  { query: 'catering packages for 100 pax', clicks: 3, impressions: 2700, ctr: 0.0011, position: 24.6 },
  { query: 'christmas party package manila', clicks: 2, impressions: 2200, ctr: 0.0009, position: 28.1 },
  { query: 'how much is catering for 50 pax', clicks: 5, impressions: 1300, ctr: 0.0038, position: 22.4 },
  { query: 'hizons catering', clicks: 940, impressions: 1600, ctr: 0.5875, position: 1.1 },
  { query: 'buffet catering metro manila', clicks: 55, impressions: 2400, ctr: 0.0229, position: 9.2 },
];

export const gscPages = [
  { page: 'https://hizonscatering.com/', clicks: 1120, impressions: 14000, ctr: 0.08, position: 4.2 },
  { page: 'https://hizonscatering.com/weddings', clicks: 210, impressions: 6400, ctr: 0.033, position: 9.8 },
  { page: 'https://hizonscatering.com/blog/catering-cost', clicks: 34, impressions: 5200, ctr: 0.0065, position: 15.1 },
  { page: 'https://hizonscatering.com/blog/wedding-checklist', clicks: 28, impressions: 2100, ctr: 0.013, position: 13.4 },
  { page: 'https://hizonscatering.com/debut', clicks: 88, impressions: 2600, ctr: 0.034, position: 8.1 },
];

export const gscPriorPages = [
  { page: 'https://hizonscatering.com/', clicks: 1080, impressions: 13200, ctr: 0.082, position: 4.4 },
  { page: 'https://hizonscatering.com/weddings', clicks: 205, impressions: 6100, ctr: 0.034, position: 9.9 },
  { page: 'https://hizonscatering.com/blog/catering-cost', clicks: 96, impressions: 5600, ctr: 0.017, position: 11.2 },
  { page: 'https://hizonscatering.com/blog/wedding-checklist', clicks: 145, impressions: 3400, ctr: 0.043, position: 7.6 },
  { page: 'https://hizonscatering.com/debut', clicks: 80, impressions: 2500, ctr: 0.032, position: 8.4 },
];

export const gscQueriesByPage = [
  { page: 'https://hizonscatering.com/blog/wedding-checklist', query: 'wedding planning checklist philippines', clicks: 20, impressions: 1800, ctr: 0.011, position: 12.9 },
  { page: 'https://hizonscatering.com/blog/catering-cost', query: 'catering price per head philippines', clicks: 22, impressions: 4100, ctr: 0.0054, position: 14.2 },
  { page: 'https://hizonscatering.com/weddings', query: 'wedding catering packages', clicks: 41, impressions: 3800, ctr: 0.0108, position: 11.4 },
];

export const ga4Pages = [
  { pagePath: '/', dateRange: 'current', screenPageViews: 4200, sessions: 3100, userEngagementDuration: 92000, keyEvents: 46 },
  { pagePath: '/', dateRange: 'prior', screenPageViews: 4050, sessions: 2980, userEngagementDuration: 88000, keyEvents: 42 },
  { pagePath: '/weddings', dateRange: 'current', screenPageViews: 1450, sessions: 980, userEngagementDuration: 41000, keyEvents: 22 },
  { pagePath: '/weddings', dateRange: 'prior', screenPageViews: 1390, sessions: 940, userEngagementDuration: 39000, keyEvents: 19 },
  { pagePath: '/blog/catering-cost', dateRange: 'current', screenPageViews: 310, sessions: 260, userEngagementDuration: 9800, keyEvents: 2 },
  { pagePath: '/blog/catering-cost', dateRange: 'prior', screenPageViews: 880, sessions: 700, userEngagementDuration: 26000, keyEvents: 9 },
  { pagePath: '/blog/wedding-checklist', dateRange: 'current', screenPageViews: 240, sessions: 200, userEngagementDuration: 7100, keyEvents: 1 },
  { pagePath: '/blog/wedding-checklist', dateRange: 'prior', screenPageViews: 1150, sessions: 900, userEngagementDuration: 33000, keyEvents: 11 },
];

export const ga4Channels = [
  { sessionDefaultChannelGroup: 'Organic Search', sessions: 5400, keyEvents: 61 },
  { sessionDefaultChannelGroup: 'Direct', sessions: 2100, keyEvents: 28 },
  { sessionDefaultChannelGroup: 'Organic Social', sessions: 1750, keyEvents: 19 },
  { sessionDefaultChannelGroup: 'Paid Search', sessions: 1200, keyEvents: 24 },
  { sessionDefaultChannelGroup: 'Referral', sessions: 380, keyEvents: 3 },
];

export const ga4LandingPages = [
  { landingPage: '/weddings', sessions: 980, keyEvents: 22 },
  { landingPage: '/', sessions: 3100, keyEvents: 46 },
  { landingPage: '/debut', sessions: 540, keyEvents: 14 },
  { landingPage: '/blog/catering-cost', sessions: 260, keyEvents: 2 },
];

export const blogPosts = [
  { id: 'p1', title: 'How Much Does Catering Cost in the Philippines?', slug: 'catering-cost', url: 'https://hizonscatering.com/blog/catering-cost', excerpt: '', publishedAt: '2024-02-11T00:00:00Z', updatedAt: '2024-02-11T00:00:00Z', minutesToRead: 6, categoryIds: [], tagIds: [], pinned: false },
  { id: 'p2', title: 'The Complete Wedding Planning Checklist', slug: 'wedding-checklist', url: 'https://hizonscatering.com/blog/wedding-checklist', excerpt: '', publishedAt: '2023-08-04T00:00:00Z', updatedAt: '2023-08-04T00:00:00Z', minutesToRead: 9, categoryIds: [], tagIds: [], pinned: false },
  { id: 'p3', title: 'Five Debut Themes That Photograph Well', slug: 'debut-themes', url: 'https://hizonscatering.com/blog/debut-themes', excerpt: '', publishedAt: '2025-03-22T00:00:00Z', updatedAt: '2025-03-22T00:00:00Z', minutesToRead: 5, categoryIds: [], tagIds: [], pinned: false },
];

export const leads = {
  sources: [
    { source: 'Website', subSource: 'Wedding Package Inquiry', leads: 48, lastSeen: '2026-09-05' },
    { source: 'Website', subSource: 'Homepage Inquiry', leads: 36, lastSeen: '2026-09-08' },
    { source: 'Google Ads', subSource: 'Corporate Christmas', leads: 21, lastSeen: '2026-09-07' },
    { source: 'Website', subSource: 'Debut Package Inquiry', leads: 17, lastSeen: '2026-09-02' },
    { source: 'Exhibit', subSource: 'Bridal Fair Aug 2026', leads: 29, lastSeen: '2026-08-24' },
  ],
  byEventType: { Wedding: 71, Corporate: 34, Debut: 22, "Kid's Party": 9, 'Private Event': 6, Unassigned: 9 },
  bySubSource: { 'Wedding Package Inquiry': 48, 'Homepage Inquiry': 36, 'Corporate Christmas': 21, 'Debut Package Inquiry': 17, 'Bridal Fair Aug 2026': 29 },
  total: 151,
  errors: [],
};

/** The bundle shape `index.js` builds from live sources. */
export function sampleDataset() {
  return {
    semrushKeywords,
    competitorKeywords,
    competitors,
    gscQueries,
    gscPages,
    gscPriorPages,
    gscQueriesByPage,
    ga4Pages,
    ga4Channels,
    ga4LandingPages,
    blogPosts,
    leads,
  };
}

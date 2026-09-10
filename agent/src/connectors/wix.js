/**
 * Wix.
 *
 * Two things are wanted from Wix, and they come from different APIs.
 *
 * The blog post list is the content *inventory* — it is how the agent knows
 * what already exists, so it recommends refreshing the guide you wrote in 2024
 * instead of cheerfully proposing you write it again.
 *
 * The analytics figures are the on-site numbers. Wix has moved this endpoint
 * more than once and exposes different measurements on different plans, so the
 * path is overridable with WIX_ANALYTICS_PATH and a failure here is never
 * fatal — GA4 covers the same ground and is the better source anyway.
 */

import { requestJson } from '../http.js';

const HOST = 'https://www.wixapis.com';
const DEFAULT_ANALYTICS_PATH = '/analytics/v2/site-analytics/data';

export function createWixClient({ apiKey, siteId, accountId, analyticsPath, fetchImpl }) {
  const headers = {
    Authorization: apiKey,
    'Content-Type': 'application/json',
    'wix-site-id': siteId,
    ...(accountId ? { 'wix-account-id': accountId } : {}),
  };

  return {
    /** Published blog posts, newest first. Paged through to `limit`. */
    async blogPosts({ limit = 200 } = {}) {
      const posts = [];
      const pageSize = 50;

      while (posts.length < limit) {
        const payload = await requestJson(`${HOST}/blog/v3/posts/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: {
              paging: { limit: Math.min(pageSize, limit - posts.length), offset: posts.length },
              sort: [{ fieldName: 'firstPublishedDate', order: 'DESC' }],
            },
            fieldsets: ['URL'],
          }),
          label: 'Wix blog posts',
          fetchImpl,
        });

        const batch = payload.posts || [];
        posts.push(...batch);
        if (batch.length < pageSize) break;
      }

      return posts.slice(0, limit).map((post) => ({
        id: post.id,
        title: post.title || '',
        slug: post.slug || '',
        url: post.url?.base && post.url?.path ? `${post.url.base}${post.url.path}` : (post.url?.path || ''),
        excerpt: post.excerpt || '',
        publishedAt: post.firstPublishedDate || null,
        updatedAt: post.lastPublishedDate || null,
        minutesToRead: post.minutesToRead || 0,
        categoryIds: post.categoryIds || [],
        tagIds: post.tagIds || [],
        pinned: Boolean(post.pinned),
      }));
    },

    /** Site-wide session and visitor totals for a date range. */
    async siteAnalytics({ startDate, endDate, measurementTypes }) {
      const payload = await requestJson(`${HOST}${analyticsPath || DEFAULT_ANALYTICS_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dateRange: { startDate, endDate },
          measurementTypes: measurementTypes || ['TOTAL_SESSIONS', 'TOTAL_UNIQUE_VISITORS', 'CLICKS_TO_CONTACT'],
        }),
        label: 'Wix site analytics',
        fetchImpl,
        // Lower than the default: this is the optional source, and a slow
        // failure here should not hold up the rest of the run.
        retries: 1,
      });
      return payload.data || [];
    },
  };
}

export async function fetchWix({ apiKey, siteId, accountId, analyticsPath, windows, fetchImpl, log = () => {} }) {
  const client = createWixClient({ apiKey, siteId, accountId, analyticsPath, fetchImpl });
  const result = { blogPosts: [], analytics: [], errors: [] };

  try {
    result.blogPosts = await client.blogPosts();
    log(`Wix: ${result.blogPosts.length} blog posts in the inventory`);
  } catch (error) {
    result.errors.push(`blog posts: ${error.message}`);
  }

  try {
    result.analytics = await client.siteAnalytics(windows.current);
  } catch (error) {
    // Expected on some plans. Recorded, not shouted about.
    result.errors.push(`site analytics: ${error.message}`);
  }

  return result;
}

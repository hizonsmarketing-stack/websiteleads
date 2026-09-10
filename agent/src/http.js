/**
 * One HTTP helper, shared by every connector.
 *
 * Retries only what is worth retrying: a 429, a 5xx, or a transport error. A
 * 401 or a 403 means the credential is wrong and trying again four times just
 * makes the run slower before it fails the same way.
 */

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpError extends Error {
  constructor(message, { status = null, body = '' } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} url
 * @param {object} options - passed to fetch, plus:
 *   `retries` (default 3), `timeoutMs` (default 30000), `label` for errors,
 *   and `fetchImpl` so tests can hand in their own.
 */
export async function request(url, options = {}) {
  const {
    retries = 3,
    timeoutMs = 30000,
    label = url,
    fetchImpl = globalThis.fetch,
    ...init
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      // 1s, 2s, 4s. Semrush and the Google APIs both rate-limit per minute,
      // so backing off genuinely clears it rather than just delaying the same
      // rejection.
      await sleep(2 ** (attempt - 1) * 1000);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      const body = await response.text();

      if (response.ok) return { status: response.status, body, headers: response.headers };

      const error = new HttpError(`${label} returned ${response.status}`, {
        status: response.status,
        body: body.slice(0, 500),
      });

      if (!RETRYABLE_STATUS.has(response.status)) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof HttpError && !RETRYABLE_STATUS.has(error.status)) throw error;
      lastError = error instanceof HttpError
        ? error
        : new HttpError(`${label} failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/** As `request`, but parses JSON and gives a useful error when it isn't JSON. */
export async function requestJson(url, options = {}) {
  const { body, status } = await request(url, options);
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(`${options.label || url} returned ${status} but not JSON`, {
      status,
      body: body.slice(0, 500),
    });
  }
}

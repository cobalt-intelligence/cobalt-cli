/**
 * Concurrency / rate-limit guidance for AI agents driving the Cobalt CLI.
 *
 * The Cobalt API itself accepts very high request rates, but the upstream
 * Secretary-of-State scrapers have practical concurrency ceilings. Above the
 * thresholds below, requests are *queued* (not rejected) — agents that
 * parallelize aggressively will see latency balloon, not errors. The right
 * answer is to keep concurrent request counts at or below these limits and
 * use `retryId` polling for long-running searches instead of fanning out.
 *
 * Defaults can be overridden at runtime (e.g. for staging or for customers
 * with custom limits) via env vars:
 *   COBALT_MAX_CONCURRENT_PER_STATE
 *   COBALT_MAX_CONCURRENT_PER_ACCOUNT
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface RateLimits {
  /** Max concurrent in-flight requests for a single state, per account. */
  max_concurrent_per_state: number;
  /** Max concurrent in-flight requests across all states for the account. */
  max_concurrent_per_account: number;
  /** Behavior above the limits: 'queue' (default) or 'reject'. */
  over_limit_behavior: 'queue';
  /** Multi-line, copy-pasteable guidance an agent can show to its human. */
  guidance: string;
  /** Compact, single-sentence summary suitable for log lines. */
  summary: string;
  /** Docs URL with the latest published limits. */
  docs_url: string;
}

export function getRateLimits(): RateLimits {
  const perState = intFromEnv('COBALT_MAX_CONCURRENT_PER_STATE', 2);
  const perAccount = intFromEnv('COBALT_MAX_CONCURRENT_PER_ACCOUNT', 5);
  const docs =
    process.env.COBALT_DOCS_URL || 'https://documentation.cobaltintelligence.com';

  const summary =
    `Keep concurrent SOS requests at or below ${perState} per state and ` +
    `${perAccount} per account. Above these, requests are queued (not rejected) ` +
    `and latency increases significantly.`;

  const guidance = [
    'Cobalt SOS concurrency guidance:',
    `  • At most ${perState} concurrent requests for the same state.`,
    `  • At most ${perAccount} concurrent requests across all states for your account.`,
    '  • Above these thresholds, requests are queued — not rejected — but latency grows.',
    '  • For long-running searches, prefer the retryId polling pattern over parallelizing more.',
    '  • A 429 response means the queue itself is saturated; honor `retry_after_seconds`.',
    `  • Override locally with ${'COBALT_MAX_CONCURRENT_PER_STATE'} / ${'COBALT_MAX_CONCURRENT_PER_ACCOUNT'} env vars.`,
    `Docs: ${docs}`,
  ].join('\n');

  return {
    max_concurrent_per_state: perState,
    max_concurrent_per_account: perAccount,
    over_limit_behavior: 'queue',
    guidance,
    summary,
    docs_url: docs,
  };
}

/**
 * Polls a long-running SOS request that returned a `retryId`.
 *
 * The Cobalt SOS endpoint may respond with `{ retryId, status: "incomplete" }`
 * for slow states. We re-issue the GET with `retryId` until it resolves or
 * exceeds maxAttempts.
 */
import { CobaltClient } from './client';
import { CobaltError } from './errors';

export interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
  onTick?: (attempt: number) => void;
  screenshot?: boolean;
}

export async function pollSosRetry(
  client: CobaltClient,
  retryId: string,
  opts: PollOptions = {}
): Promise<unknown> {
  const interval = opts.intervalMs ?? 5_000;
  const max = opts.maxAttempts ?? 36; // ~3 minutes by default

  for (let i = 1; i <= max; i++) {
    opts.onTick?.(i);
    await sleep(interval);
    const params: Record<string, unknown> = { retryId };
    if (opts.screenshot) params.screenshot = true;
    const res = await client.get<{ status?: string; statusCode?: number }>('/v1/search', params);
    const status = String(res.data?.status || '').toLowerCase();
    if (status && status !== 'incomplete' && status !== 'pending') {
      return res.data;
    }
  }
  throw new CobaltError(
    'TIMEOUT',
    `Live SOS lookup did not complete after ${max} polls. retryId=${retryId} — try again with --async to handle the retryId yourself.`
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

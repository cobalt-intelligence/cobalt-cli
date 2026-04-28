/**
 * Secretary of State search:
 *   GET /v1/search
 *
 * Maps the documented params (searchQuery, sosId, searchByPersonFirstName,
 * searchByPersonLastName, retryId, state, liveData, street, city, zip,
 * screenshot, uccData, test, callbackUrl, findRelatedBusinesses).
 */
import { Command } from 'commander';
import { CobaltClient } from '../lib/client';
import { emit, envelope } from '../lib/output';
import { getGlobals, pickFormat } from '../lib/globalOptions';
import { getDefaultState } from '../lib/config';
import { CobaltError } from '../lib/errors';
import { pollSosRetry } from '../lib/poll';

export function registerSosCommands(program: Command): void {
  const sos = program
    .command('sos')
    .description('Secretary of State business search across 50 states + DC');

  // ---- search ----
  sos
    .command('search [query]')
    .description('Search for a business by name, SOS ID, or person')
    .option('-s, --state <state>', 'State (e.g. UT, northCarolina) — required unless --retry-id')
    .option('--sos-id <id>', 'Search by Secretary of State / Entity ID')
    .option('--first-name <name>', 'Search by person first name')
    .option('--last-name <name>', 'Search by person last name')
    .option('--retry-id <id>', 'Continue a previously-started long-running request')
    .option('--cached', 'Use cached data (sets liveData=false)')
    .option('--street <street>', 'AND-filter results by street')
    .option('--city <city>', 'AND-filter results by city')
    .option('--zip <zip>', 'AND-filter results by zip')
    .option('--screenshot', 'Include a short-lived screenshot URL when supported')
    .option('--ucc', 'Include UCC lien data when supported')
    .option('--related', 'Include related businesses (findRelatedBusinesses=true)')
    .option(
      '--test <mode>',
      'Return dummy data without billing. One of: complete, incomplete, failed, retryIdInvalid, badRequest'
    )
    .option('--callback-url <url>', 'Webhook URL to receive completed results')
    .option('--async', 'Return retryId immediately instead of polling for completion')
    .option('--poll-interval <ms>', 'Poll interval for live lookups (default 5000)', '5000')
    .option('--poll-max <attempts>', 'Max poll attempts (default 36 ≈ 3 min)', '36')
    .action(async (query: string | undefined, opts) => {
      const g = getGlobals(sos);
      const client = new CobaltClient({
        apiKey: g.apiKey,
        endpoint: g.endpoint,
        timeoutMs: Number(g.timeout) || undefined,
        verbose: g.verbose,
      });

      const state = opts.state || getDefaultState();
      const hasIdentity =
        query || opts.sosId || opts.firstName || opts.lastName || opts.retryId;
      if (!hasIdentity) {
        throw new CobaltError(
          'BAD_REQUEST',
          'Provide a query, --sos-id, --first-name, --last-name, or --retry-id'
        );
      }
      if (!opts.retryId && !state) {
        throw new CobaltError('BAD_REQUEST', 'A --state is required (or set defaultState in config).');
      }

      const params: Record<string, unknown> = {
        searchQuery: query,
        sosId: opts.sosId,
        searchByPersonFirstName: opts.firstName,
        searchByPersonLastName: opts.lastName,
        retryId: opts.retryId,
        state,
        liveData: opts.cached ? false : undefined, // default true on the API
        street: opts.street,
        city: opts.city,
        zip: opts.zip,
        screenshot: opts.screenshot ? true : undefined,
        uccData: opts.ucc ? true : undefined,
        findRelatedBusinesses: opts.related ? true : undefined,
        test: opts.test,
        callbackUrl: opts.callbackUrl,
      };

      const res = await client.get<any>('/v1/search', params);
      const body = res.data;

      // The API returns { retryId, status: "incomplete", ... } for slow lookups.
      const retryId = body?.retryId;
      const status = String(body?.status || '').toLowerCase();
      const incomplete = retryId && (status === 'incomplete' || status === 'pending');

      if (incomplete && opts.async) {
        emit(
          envelope(body, { state, mode: 'async', retryId }),
          { format: pickFormat(g), quiet: g.quiet }
        );
        return;
      }

      if (incomplete) {
        const final = await pollSosRetry(client, retryId, {
          intervalMs: Number(opts.pollInterval),
          maxAttempts: Number(opts.pollMax),
          screenshot: opts.screenshot,
          onTick: (n) => {
            if (g.verbose) process.stderr.write(`… polling retryId=${retryId} (attempt ${n})\n`);
          },
        });
        emit(envelope(final, { state, polled: true, retryId }), { format: pickFormat(g), quiet: g.quiet });
        return;
      }

      emit(envelope(body, { state }), { format: pickFormat(g), quiet: g.quiet });
    });

  // ---- get (sugar over search --sos-id) ----
  sos
    .command('get <sosId>')
    .description('Fetch a business by its Secretary of State / Entity ID')
    .requiredOption('-s, --state <state>', 'State (e.g. UT, northCarolina)')
    .option('--cached', 'Use cached data')
    .option('--screenshot', 'Include a screenshot URL when supported')
    .option('--ucc', 'Include UCC lien data when supported')
    .option('--related', 'Include related businesses')
    .action(async (sosId: string, opts) => {
      const g = getGlobals(sos);
      const client = new CobaltClient({
        apiKey: g.apiKey,
        endpoint: g.endpoint,
        timeoutMs: Number(g.timeout) || undefined,
        verbose: g.verbose,
      });
      const params: Record<string, unknown> = {
        sosId,
        state: opts.state,
        liveData: opts.cached ? false : undefined,
        screenshot: opts.screenshot || undefined,
        uccData: opts.ucc || undefined,
        findRelatedBusinesses: opts.related || undefined,
      };
      const res = await client.get<any>('/v1/search', params);
      const body = res.data;
      const retryId = body?.retryId;
      const status = String(body?.status || '').toLowerCase();
      if (retryId && (status === 'incomplete' || status === 'pending')) {
        const final = await pollSosRetry(client, retryId, { screenshot: opts.screenshot });
        emit(envelope(final, { state: opts.state, polled: true, retryId }), { format: pickFormat(g), quiet: g.quiet });
        return;
      }
      emit(envelope(body, { state: opts.state }), { format: pickFormat(g), quiet: g.quiet });
    });

  // ---- retry (resume a previous retryId) ----
  sos
    .command('retry <retryId>')
    .description('Resume a long-running SOS lookup using its retryId')
    .option('--screenshot', 'Include a screenshot URL when supported')
    .option('--once', 'Make a single status check instead of polling')
    .action(async (retryId: string, opts) => {
      const g = getGlobals(sos);
      const client = new CobaltClient({
        apiKey: g.apiKey,
        endpoint: g.endpoint,
        timeoutMs: Number(g.timeout) || undefined,
        verbose: g.verbose,
      });
      if (opts.once) {
        const res = await client.get<any>('/v1/search', {
          retryId,
          screenshot: opts.screenshot || undefined,
        });
        emit(envelope(res.data, { retryId }), { format: pickFormat(g), quiet: g.quiet });
        return;
      }
      const final = await pollSosRetry(client, retryId, { screenshot: opts.screenshot });
      emit(envelope(final, { retryId, polled: true }), { format: pickFormat(g), quiet: g.quiet });
    });
}

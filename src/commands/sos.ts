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
import { getDefaultState, getEndpoint } from '../lib/config';
import { CobaltError } from '../lib/errors';
import { pollSosRetry } from '../lib/poll';
import { savePending, clearPending, listPending, pendingDirPath } from '../lib/pending';
import chalk from 'chalk';

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

      // CRITICAL: surface and persist the retryId IMMEDIATELY, before polling.
      // The user has already been charged for this search; if the CLI process
      // dies (Ctrl+C, network drop, timeout), the retryId is the only way to
      // recover the result. Always print it to stderr and write it to disk so
      // `cobalt sos pending` can find it later.
      if (retryId) {
        const entry = {
          retryId,
          state,
          query: { ...params },
          startedAt: new Date().toISOString(),
          endpoint: g.endpoint || getEndpoint(),
        };
        const file = savePending(entry);
        const tty = process.stderr.isTTY;
        const msg = tty
          ? chalk.yellow(`! retryId issued: ${retryId}\n  recover with: cobalt sos retry ${retryId}\n  saved to: ${file}\n`)
          : `# retryId=${retryId} saved=${file}\n`;
        process.stderr.write(msg);

        // Surface retryId via Ctrl+C too — handler removes itself once we
        // either resolve or fail.
        const onSigint = () => {
          process.stderr.write(
            (tty ? chalk.yellow : (s: string) => s)(
              `\n! interrupted — retryId ${retryId} is saved. Resume with:\n  cobalt sos retry ${retryId}\n`
            )
          );
          process.exit(130);
        };
        process.on('SIGINT', onSigint);
        // Make sure async/non-async paths below clean up.
        const cleanup = () => process.removeListener('SIGINT', onSigint);

        if (incomplete && opts.async) {
          cleanup();
          emit(
            envelope(body, { state, mode: 'async', retryId, pendingFile: file }),
            { format: pickFormat(g), quiet: g.quiet }
          );
          return;
        }

        if (incomplete) {
          try {
            const final = await pollSosRetry(client, retryId, {
              intervalMs: Number(opts.pollInterval),
              maxAttempts: Number(opts.pollMax),
              screenshot: opts.screenshot,
              onTick: (n) => {
                if (g.verbose) process.stderr.write(`… polling retryId=${retryId} (attempt ${n})\n`);
              },
            });
            cleanup();
            clearPending(retryId);
            emit(envelope(final, { state, polled: true, retryId }), {
              format: pickFormat(g),
              quiet: g.quiet,
            });
            return;
          } catch (err) {
            cleanup();
            // Re-throw with retryId attached so the user (and any agent) knows
            // exactly how to recover. The pending file stays on disk.
            if (err instanceof CobaltError && err.code === 'TIMEOUT') {
              throw new CobaltError(
                'TIMEOUT',
                `Live SOS lookup timed out. Recover with: cobalt sos retry ${retryId}`,
                { retryId, pendingFile: file }
              );
            }
            throw err;
          }
        }
        // Synchronous-complete responses with a retryId are unusual but
        // defensible — clear the pending entry since the data is in hand.
        cleanup();
        clearPending(retryId);
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
      if (retryId) {
        const file = savePending({
          retryId,
          state: opts.state,
          query: { sosId, ...params },
          startedAt: new Date().toISOString(),
          endpoint: g.endpoint || getEndpoint(),
        });
        const tty = process.stderr.isTTY;
        process.stderr.write(
          tty
            ? chalk.yellow(`! retryId issued: ${retryId}\n  recover with: cobalt sos retry ${retryId}\n  saved to: ${file}\n`)
            : `# retryId=${retryId} saved=${file}\n`
        );
        const onSigint = () => {
          process.stderr.write(`\n! interrupted — retryId ${retryId} is saved.\n`);
          process.exit(130);
        };
        process.on('SIGINT', onSigint);
        if (status === 'incomplete' || status === 'pending') {
          try {
            const final = await pollSosRetry(client, retryId, { screenshot: opts.screenshot });
            process.removeListener('SIGINT', onSigint);
            clearPending(retryId);
            emit(envelope(final, { state: opts.state, polled: true, retryId }), { format: pickFormat(g), quiet: g.quiet });
            return;
          } catch (err) {
            process.removeListener('SIGINT', onSigint);
            if (err instanceof CobaltError && err.code === 'TIMEOUT') {
              throw new CobaltError(
                'TIMEOUT',
                `Live SOS lookup timed out. Recover with: cobalt sos retry ${retryId}`,
                { retryId, pendingFile: file }
              );
            }
            throw err;
          }
        }
        process.removeListener('SIGINT', onSigint);
        clearPending(retryId);
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
        const status = String(res.data?.status || '').toLowerCase();
        const terminal = status && status !== 'incomplete' && status !== 'pending';
        if (terminal) clearPending(retryId);
        emit(envelope(res.data, { retryId, terminalStatus: terminal }), { format: pickFormat(g), quiet: g.quiet });
        return;
      }
      const final = await pollSosRetry(client, retryId, { screenshot: opts.screenshot });
      clearPending(retryId);
      emit(envelope(final, { retryId, polled: true }), { format: pickFormat(g), quiet: g.quiet });
    });

  // ---- pending (list / forget retryIds saved on disk) ----
  const pending = sos.command('pending').description('List or clear retryIds persisted to disk');

  pending
    .command('list', { isDefault: true })
    .description('List outstanding retryIds you can recover with `cobalt sos retry`')
    .action(() => {
      const g = getGlobals(sos);
      const entries = listPending();
      emit(envelope(entries, { count: entries.length, dir: pendingDirPath() }), {
        format: pickFormat(g),
        quiet: g.quiet,
      });
    });

  pending
    .command('clear <retryId>')
    .description('Forget a saved retryId (does not affect the server)')
    .action((retryId: string) => {
      const g = getGlobals(sos);
      clearPending(retryId);
      emit(envelope({ ok: true, removed: retryId }, {}), { format: pickFormat(g), quiet: g.quiet });
    });
}

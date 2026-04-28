/**
 * Full Verification (50 states + DC):
 *   POST /fullVerification  { action: "initVerification", ... }
 *
 * The API issues a `searchGuid` you can then poll. We expose:
 *   cobalt full-verification start   — kicks off the job
 *   cobalt full-verification status  — polls (POST with action: "checkStatus")
 *   cobalt full-verification wait    — auto-polls until terminal state
 *
 * NOTE: The status/poll action name is inferred from common Cobalt patterns
 * ("checkStatus") but isn't shown in the public docs. If it differs in
 * production, override with --status-action.
 */
import { Command } from 'commander';
import { CobaltClient } from '../lib/client';
import { emit, envelope } from '../lib/output';
import { getGlobals, pickFormat } from '../lib/globalOptions';
import { CobaltError } from '../lib/errors';

export function registerFullVerificationCommands(program: Command): void {
  const fv = program
    .command('full-verification')
    .alias('fv')
    .description('All-50-states full verification (long-running, async)');

  fv
    .command('start')
    .description('Start a 50-state verification. Returns a searchGuid.')
    .option('--business-name <name>', 'Business name to verify')
    .option('--first-name <name>', 'Person first name')
    .option('--last-name <name>', 'Person last name')
    .option('--business-street <street>')
    .option('--business-city <city>')
    .option('--business-state <state>')
    .option('--business-zip <zip>')
    .option('--owner-street <street>')
    .option('--owner-city <city>')
    .option('--owner-state <state>')
    .option('--owner-zip <zip>')
    .option('--callback-url <url>', 'Optional webhook to receive results when complete')
    .action(async (opts) => {
      const g = getGlobals(fv);
      if (!opts.businessName && !opts.firstName && !opts.lastName) {
        throw new CobaltError(
          'BAD_REQUEST',
          'Provide at least one of --business-name, --first-name, or --last-name'
        );
      }
      const client = new CobaltClient({
        apiKey: g.apiKey,
        endpoint: g.endpoint,
        timeoutMs: Number(g.timeout) || undefined,
        verbose: g.verbose,
      });
      const body: Record<string, unknown> = {
        action: 'initVerification',
        businessName: opts.businessName,
        firstName: opts.firstName,
        lastName: opts.lastName,
        businessStreetAddress: opts.businessStreet,
        businessCity: opts.businessCity,
        businessState: opts.businessState,
        businessZip: opts.businessZip,
        ownerStreetAddress: opts.ownerStreet,
        ownerCity: opts.ownerCity,
        ownerState: opts.ownerState,
        ownerZip: opts.ownerZip,
        callbackUrl: opts.callbackUrl,
      };
      const res = await client.post<any>('/fullVerification', body);
      emit(envelope(res.data, {}), { format: pickFormat(g), quiet: g.quiet });
    });

  fv
    .command('status <searchGuid>')
    .description('Check status of a full-verification run')
    .option('--status-action <name>', 'Override the status action name', 'checkStatus')
    .action(async (searchGuid: string, opts) => {
      const g = getGlobals(fv);
      const client = new CobaltClient({
        apiKey: g.apiKey,
        endpoint: g.endpoint,
        timeoutMs: Number(g.timeout) || undefined,
        verbose: g.verbose,
      });
      const res = await client.post<any>('/fullVerification', {
        action: opts.statusAction,
        searchGuid,
      });
      emit(envelope(res.data, { searchGuid }), { format: pickFormat(g), quiet: g.quiet });
    });

  fv
    .command('wait <searchGuid>')
    .description('Poll a full-verification run until it completes')
    .option('--interval <ms>', 'Poll interval', '15000')
    .option('--max <attempts>', 'Max poll attempts', '120')
    .option('--status-action <name>', 'Override the status action name', 'checkStatus')
    .action(async (searchGuid: string, opts) => {
      const g = getGlobals(fv);
      const client = new CobaltClient({
        apiKey: g.apiKey,
        endpoint: g.endpoint,
        timeoutMs: Number(g.timeout) || undefined,
        verbose: g.verbose,
      });
      const interval = Number(opts.interval);
      const max = Number(opts.max);
      for (let i = 1; i <= max; i++) {
        const res = await client.post<any>('/fullVerification', {
          action: opts.statusAction,
          searchGuid,
        });
        const status = String(res.data?.status || '').toLowerCase();
        if (status && !['pending', 'incomplete', 'in_progress', 'running'].includes(status)) {
          emit(envelope(res.data, { searchGuid, polled: true, attempts: i }), {
            format: pickFormat(g),
            quiet: g.quiet,
          });
          return;
        }
        if (g.verbose) process.stderr.write(`… ${searchGuid} status=${status} attempt=${i}\n`);
        await new Promise((r) => setTimeout(r, interval));
      }
      throw new CobaltError(
        'TIMEOUT',
        `Full verification ${searchGuid} did not complete after ${max} polls.`
      );
    });
}

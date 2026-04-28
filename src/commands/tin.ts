/**
 * TIN verification:
 *   GET /tinVerification
 */
import { Command } from 'commander';
import { CobaltClient } from '../lib/client';
import { emit, envelope } from '../lib/output';
import { getGlobals, pickFormat } from '../lib/globalOptions';

export function registerTinCommands(program: Command): void {
  const tin = program.command('tin').description('IRS TIN verification');

  tin
    .command('verify')
    .description('Verify a business TIN against IRS records')
    .requiredOption('--tin <tin>', 'Business TIN (9-digit)')
    .requiredOption('--name <businessName>', 'Business name as registered with IRS')
    .action(async (opts: { tin: string; name: string }) => {
      const g = getGlobals(tin);
      const client = new CobaltClient({
        apiKey: g.apiKey,
        endpoint: g.endpoint,
        timeoutMs: Number(g.timeout) || undefined,
        verbose: g.verbose,
      });
      const res = await client.get<any>('/tinVerification', {
        tin: opts.tin,
        businessName: opts.name,
      });
      emit(envelope(res.data, { tin: opts.tin }), { format: pickFormat(g), quiet: g.quiet });
    });
}

/**
 * OFAC / sanctions screening:
 *   GET /ofac
 */
import { Command } from 'commander';
import { CobaltClient } from '../lib/client';
import { emit, envelope } from '../lib/output';
import { getGlobals, pickFormat } from '../lib/globalOptions';

export function registerOfacCommands(program: Command): void {
  const ofac = program.command('ofac').description('OFAC and global sanctions list screening');

  ofac
    .command('search <query>')
    .description('Screen a business or person against sanction lists')
    .option(
      '-t, --type <type>',
      'Search type: organization | person | vessel | aircraft (default: all four)'
    )
    .option(
      '--sources <list>',
      'Comma- or space-separated source list (e.g. SDN,NONSDN,SECO,UN). All sources if omitted.'
    )
    .option('--score <n>', 'Fuzzy-match minimum score 80–100 (default 95)', (v) => Number(v))
    .option('--address <addr>', 'Address filter')
    .option('--state <stateOrProvince>', 'State or province filter')
    .option('--city <city>', 'City filter')
    .option('--postal-code <zip>', 'Postal / zip code filter')
    .action(async (query: string, opts) => {
      const g = getGlobals(ofac);
      const client = new CobaltClient({
        apiKey: g.apiKey,
        endpoint: g.endpoint,
        timeoutMs: Number(g.timeout) || undefined,
        verbose: g.verbose,
      });
      const res = await client.get<any>('/ofac', {
        searchQuery: query,
        searchType: opts.type,
        sources: opts.sources,
        score: opts.score,
        address: opts.address,
        stateOrProvince: opts.state,
        city: opts.city,
        postalCode: opts.postalCode,
      });
      emit(envelope(res.data, { searchQuery: query }), { format: pickFormat(g), quiet: g.quiet });
    });
}

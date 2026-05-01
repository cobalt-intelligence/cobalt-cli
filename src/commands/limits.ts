import { Command } from 'commander';
import { emit, envelope } from '../lib/output';
import { getGlobals, pickFormat } from '../lib/globalOptions';
import { getRateLimits } from '../lib/rateLimits';

export function registerLimitsCommand(program: Command): void {
  program
    .command('limits')
    .description('Show recommended concurrency / rate limits (useful for AI agents)')
    .action(() => {
      const g = getGlobals(program);
      const limits = getRateLimits();
      emit(envelope(limits, {}, null), { format: pickFormat(g), quiet: g.quiet });
    });
}

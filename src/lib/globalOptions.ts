/**
 * Global flags, attached to the root command and inherited by every subcommand.
 */
import { Command, Option } from 'commander';

export interface GlobalFlags {
  format?: 'json' | 'pretty' | 'table';
  quiet?: boolean;
  verbose?: boolean;
  apiKey?: string;
  endpoint?: string;
  timeout?: string;
}

export function addGlobalOptions(program: Command): void {
  program
    .addOption(
      new Option('-f, --format <format>', 'output format')
        .choices(['json', 'pretty', 'table'])
    )
    .option('-q, --quiet', 'suppress non-data output')
    .option('-v, --verbose', 'verbose request logging to stderr')
    .option('--api-key <key>', 'override API key (else $COBALT_API_KEY or `cobalt auth login`)')
    .option('--endpoint <url>', 'override API base URL')
    .option('--timeout <ms>', 'request timeout in milliseconds', '120000');
}

/**
 * Extract global flags from a subcommand by walking up to the root.
 */
export function getGlobals(cmd: Command): GlobalFlags {
  let root: Command = cmd;
  while (root.parent) root = root.parent;
  return root.opts() as GlobalFlags;
}

export function pickFormat(g: GlobalFlags): 'json' | 'pretty' | 'table' {
  if (g.format) return g.format;
  return process.stdout.isTTY ? 'pretty' : 'json';
}

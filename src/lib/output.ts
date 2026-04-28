/**
 * Standard JSON envelope for all command output.
 *
 * Why: AI agents (Claude, Cursor, custom tooling) parse stdout. A consistent
 * shape with `data`, `meta`, and `error` lets them rely on structure without
 * special-casing each command.
 */
import chalk from 'chalk';

export interface Envelope<T> {
  data: T | null;
  meta: Record<string, unknown>;
  error: ErrorPayload | null;
}

export interface ErrorPayload {
  code: string;
  message: string;
  retry_after_seconds?: number;
  details?: unknown;
}

export type OutputFormat = 'json' | 'pretty' | 'table';

export function envelope<T>(
  data: T | null,
  meta: Record<string, unknown> = {},
  error: ErrorPayload | null = null
): Envelope<T> {
  return { data, meta, error };
}

export function emit<T>(env: Envelope<T>, opts: { format?: OutputFormat; quiet?: boolean } = {}) {
  const format = opts.format || (process.stdout.isTTY ? 'pretty' : 'json');

  if (format === 'json' || format === 'table') {
    // Table is rendered by individual commands; default fallback is JSON.
    process.stdout.write(JSON.stringify(env, null, format === 'json' ? 2 : 0) + '\n');
    return;
  }

  // pretty (TTY default)
  if (env.error) {
    process.stderr.write(chalk.red(`✗ ${env.error.code}: ${env.error.message}\n`));
    if (env.error.retry_after_seconds) {
      process.stderr.write(chalk.yellow(`  retry after ${env.error.retry_after_seconds}s\n`));
    }
    return;
  }
  process.stdout.write(JSON.stringify(env.data, null, 2) + '\n');
  if (!opts.quiet && Object.keys(env.meta).length) {
    process.stderr.write(chalk.gray(`# ${JSON.stringify(env.meta)}\n`));
  }
}

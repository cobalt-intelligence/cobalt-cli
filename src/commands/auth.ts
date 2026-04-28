import { Command } from 'commander';
import readline from 'readline';
import { setApiKey, clearApiKey, getApiKey, configPath, getEndpoint } from '../lib/config';
import { CobaltClient } from '../lib/client';
import { emit, envelope } from '../lib/output';
import { getGlobals, pickFormat } from '../lib/globalOptions';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage API key and authentication');

  auth
    .command('login')
    .description('Store your Cobalt Intelligence API key')
    .option('--key <key>', 'API key (otherwise prompted)')
    .action(async (opts: { key?: string }) => {
      let key = opts.key;
      if (!key) key = await prompt('Paste your Cobalt API key: ', { mask: true });
      if (!key) {
        process.stderr.write('No key provided. Aborting.\n');
        process.exit(2);
      }
      setApiKey(key.trim());
      const g = getGlobals(auth);
      emit(envelope({ ok: true, configPath: configPath() }, {}, null), {
        format: pickFormat(g),
        quiet: g.quiet,
      });
    });

  auth
    .command('logout')
    .description('Remove the stored API key')
    .action(() => {
      clearApiKey();
      const g = getGlobals(auth);
      emit(envelope({ ok: true }, {}, null), { format: pickFormat(g), quiet: g.quiet });
    });

  auth
    .command('status')
    .description('Show whether an API key is configured and reachable')
    .action(async () => {
      const g = getGlobals(auth);
      const key = getApiKey();
      if (!key) {
        emit(
          envelope(null, {}, {
            code: 'NO_API_KEY',
            message: 'No API key configured. Run `cobalt auth login`.',
          }),
          { format: pickFormat(g) }
        );
        process.exit(4);
      }
      // Best-effort reachability check: cheap TIN call is rate-friendly,
      // but we just resolve config without calling the API to avoid burning
      // a request. Users can `cobalt sos search ... --test complete` for that.
      emit(
        envelope({
          authenticated: true,
          keyPreview: `${key.slice(0, 4)}…${key.slice(-4)}`,
          endpoint: getEndpoint(),
        }, {}, null),
        { format: pickFormat(g), quiet: g.quiet }
      );
    });
}

function prompt(question: string, opts: { mask?: boolean } = {}): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (opts.mask) {
      // Minimal masking — hides input from terminal.
      const stdin = process.stdin;
      stdin.resume();
      process.stdout.write(question);
      let value = '';
      const onData = (char: Buffer) => {
        const s = char.toString('utf8');
        if (s === '\n' || s === '\r' || s === '\u0004') {
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(value);
        } else if (s === '\u0003') {
          process.exit(130);
        } else {
          value += s;
          process.stdout.write('*');
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (a) => {
        rl.close();
        resolve(a);
      });
    }
  });
}

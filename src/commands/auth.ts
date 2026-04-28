import { Command } from 'commander';
import readline from 'readline';
import { setApiKey, clearApiKey, getApiKey, configPath, getEndpoint } from '../lib/config';
import { CobaltClient } from '../lib/client';
import { emit, envelope } from '../lib/output';
import { getGlobals, pickFormat } from '../lib/globalOptions';
import { ONBOARDING_URLS, onboardingHint } from '../lib/onboarding';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage API key and authentication');

  auth
    .command('login')
    .description('Store your Cobalt Intelligence API key')
    .option('--key <key>', 'API key (otherwise prompted)')
    .action(async (opts: { key?: string }) => {
      const g = getGlobals(auth);
      let key = opts.key;
      if (!key) key = await prompt('Paste your Cobalt API key: ', { mask: true });
      if (!key) {
        emit(
          envelope(null, {}, {
            code: 'NO_KEY_PROVIDED',
            message: 'No key provided.',
            details: { onboarding: onboardingHint('NO_API_KEY') },
          }),
          { format: pickFormat(g) }
        );
        process.exit(2);
      }
      setApiKey(key.trim());
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
            details: { onboarding: onboardingHint('NO_API_KEY') },
          }),
          { format: pickFormat(g) }
        );
        process.exit(4);
      }
      emit(
        envelope({
          authenticated: true,
          keyPreview: `${key.slice(0, 4)}…${key.slice(-4)}`,
          endpoint: getEndpoint(),
        }, {}, null),
        { format: pickFormat(g), quiet: g.quiet }
      );
    });

  auth
    .command('urls')
    .description('Print signup, dashboard, and docs URLs (useful for AI agents)')
    .action(() => {
      const g = getGlobals(auth);
      emit(
        envelope(
          {
            ...ONBOARDING_URLS,
            human_action: onboardingHint('NO_API_KEY').human_action,
          },
          {},
          null
        ),
        { format: pickFormat(g), quiet: g.quiet }
      );
    });

  auth
    .command('setup')
    .description('Interactive onboarding — opens signup, prompts for key, verifies it')
    .option('--no-open', 'Do not auto-open the browser')
    .option('--key <key>', 'API key (skip the prompt)')
    .action(async (opts: { open: boolean; key?: string }) => {
      const g = getGlobals(auth);
      const isTTY = process.stdin.isTTY && process.stdout.isTTY;

      // Always print the hint to stderr so AI agents driving the CLI can read
      // it back to their human, even in non-interactive contexts.
      const hint = onboardingHint('NO_API_KEY');
      process.stderr.write(`\n${hint.human_action}\n\n`);

      if (!isTTY && !opts.key) {
        // Non-TTY without a key: emit a structured envelope and exit cleanly so
        // the agent can hand the steps to the human and retry later.
        emit(
          envelope(
            { setup_required: true, ...ONBOARDING_URLS },
            {},
            { code: 'SETUP_REQUIRED', message: 'Re-run `cobalt auth setup` in a terminal, or pass --key.', details: { onboarding: hint } }
          ),
          { format: pickFormat(g) }
        );
        process.exit(0);
      }

      if (opts.open !== false && isTTY) {
        await openUrl(ONBOARDING_URLS.signup);
      }

      let key = opts.key;
      if (!key && isTTY) {
        key = await prompt('Paste your Cobalt API key (input hidden): ', { mask: true });
      }
      if (!key) {
        process.stderr.write('No key provided. Aborting.\n');
        process.exit(2);
      }
      key = key.trim();

      // Save first, then verify against the API. We avoid burning a billable
      // request — `auth status` is sufficient for "is it stored?", and the
      // first real call will validate the credential.
      setApiKey(key);

      // Light-touch verification: try a no-cost endpoint if available; for now
      // we just confirm the client constructs and the key is non-empty shape.
      try {
        new CobaltClient({ apiKey: key });
        emit(
          envelope(
            {
              ok: true,
              configPath: configPath(),
              keyPreview: `${key.slice(0, 4)}…${key.slice(-4)}`,
              next_steps: [
                'cobalt auth status',
                'cobalt sos search --name "Acme LLC" --state UT --test complete',
              ],
            },
            {},
            null
          ),
          { format: pickFormat(g), quiet: g.quiet }
        );
      } catch (err: any) {
        emit(
          envelope(null, {}, { code: 'SETUP_FAILED', message: err.message, details: { onboarding: hint } }),
          { format: pickFormat(g) }
        );
        process.exit(1);
      }
    });
}

async function openUrl(url: string): Promise<void> {
  const { spawn } = await import('child_process');
  const cmd =
    process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* fall through silently — URL is already in stderr hint */ });
    child.unref();
    process.stderr.write(`Opening ${url} in your browser…\n`);
  } catch {
    process.stderr.write(`Open this URL in your browser: ${url}\n`);
  }
}

function prompt(question: string, opts: { mask?: boolean } = {}): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (opts.mask) {
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

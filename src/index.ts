#!/usr/bin/env node
/**
 * Cobalt Intelligence CLI entry point.
 */
import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth';
import { registerSosCommands } from './commands/sos';
import { registerOfacCommands } from './commands/ofac';
import { registerTinCommands } from './commands/tin';
import { registerFullVerificationCommands } from './commands/fullVerification';
import { registerConfigCommands } from './commands/config';
import { addGlobalOptions } from './lib/globalOptions';
import { handleError } from './lib/errors';

const pkg = require('../package.json');

const program = new Command();

program
  .name('cobalt')
  .description(
    'Cobalt Intelligence CLI — Secretary of State, OFAC, TIN, and full-verification lookups.\n' +
      'Built JSON-first for AI agents and humans alike.'
  )
  .version(pkg.version, '-V, --version', 'output the CLI version');

addGlobalOptions(program);

registerAuthCommands(program);
registerConfigCommands(program);
registerSosCommands(program);
registerOfacCommands(program);
registerTinCommands(program);
registerFullVerificationCommands(program);

program.showHelpAfterError('(run `cobalt --help` for usage)');

(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    handleError(err);
  }
})();

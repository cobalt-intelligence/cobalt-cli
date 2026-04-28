import { Command } from 'commander';
import { configStore, configPath } from '../lib/config';
import { emit, envelope } from '../lib/output';
import { getGlobals, pickFormat } from '../lib/globalOptions';

export function registerConfigCommands(program: Command): void {
  const cfg = program.command('config').description('Inspect and modify CLI configuration');

  cfg
    .command('get [key]')
    .description('Get a config value (or all values if key omitted)')
    .action((key?: string) => {
      const g = getGlobals(cfg);
      const store = configStore();
      const out = key ? { [key]: store.get(key as any) } : store.store;
      emit(envelope(out, { configPath: configPath() }), { format: pickFormat(g), quiet: g.quiet });
    });

  cfg
    .command('set <key> <value>')
    .description('Set a config value (apiKey, defaultState, endpoint)')
    .action((key: string, value: string) => {
      const g = getGlobals(cfg);
      const store = configStore();
      store.set(key as any, value);
      emit(envelope({ ok: true, [key]: value }, {}), { format: pickFormat(g), quiet: g.quiet });
    });

  cfg
    .command('unset <key>')
    .description('Remove a config value')
    .action((key: string) => {
      const g = getGlobals(cfg);
      configStore().delete(key as any);
      emit(envelope({ ok: true, removed: key }, {}), { format: pickFormat(g), quiet: g.quiet });
    });

  cfg
    .command('path')
    .description('Print the config file path')
    .action(() => {
      const g = getGlobals(cfg);
      emit(envelope({ path: configPath() }, {}), { format: pickFormat(g), quiet: g.quiet });
    });
}

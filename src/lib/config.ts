/**
 * Persistent config (API key, default state, base URL).
 * Stored at ~/.config/cobalt-cli/config.json (or platform equivalent).
 */
import Conf from 'conf';

export interface CobaltConfig {
  apiKey?: string;
  defaultState?: string;
  endpoint?: string;
}

const store = new Conf<CobaltConfig>({
  projectName: 'cobalt-cli',
  schema: {
    apiKey: { type: 'string' },
    defaultState: { type: 'string' },
    endpoint: { type: 'string' },
  },
});

export const DEFAULT_ENDPOINT = 'https://apigateway.cobaltintelligence.com';

export function getApiKey(): string | undefined {
  // Env var wins so CI / agents don't depend on writable config files.
  return process.env.COBALT_API_KEY || store.get('apiKey');
}

export function setApiKey(key: string): void {
  store.set('apiKey', key);
}

export function clearApiKey(): void {
  store.delete('apiKey');
}

export function getEndpoint(): string {
  return process.env.COBALT_ENDPOINT || store.get('endpoint') || DEFAULT_ENDPOINT;
}

export function getDefaultState(): string | undefined {
  return process.env.COBALT_DEFAULT_STATE || store.get('defaultState');
}

export function configStore() {
  return store;
}

export function configPath(): string {
  return store.path;
}

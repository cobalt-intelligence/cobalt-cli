/**
 * Thin axios-based HTTP client for the Cobalt Intelligence API.
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import http from 'http';
import https from 'https';
import { getApiKey, getEndpoint } from './config';
import { CobaltError } from './errors';
import { onboardingHint } from './onboarding';

export interface ClientOptions {
  apiKey?: string;
  endpoint?: string;
  timeoutMs?: number;
  verbose?: boolean;
}

export class CobaltClient {
  private http: AxiosInstance;
  private verbose: boolean;

  constructor(opts: ClientOptions = {}) {
    const apiKey = opts.apiKey || getApiKey();
    if (!apiKey) {
      throw new CobaltError(
        'NO_API_KEY',
        'No API key found. Run `cobalt auth login` or set COBALT_API_KEY.',
        { onboarding: onboardingHint('NO_API_KEY') }
      );
    }
    const endpoint = opts.endpoint || getEndpoint();
    this.verbose = !!opts.verbose;

    this.http = axios.create({
      baseURL: endpoint,
      timeout: opts.timeoutMs ?? 120_000,
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
        'User-Agent': `cobalt-cli/${require('../../package.json').version} node/${process.version}`,
      },
      // Disable keep-alive so the CLI process exits promptly after the request
      // completes — otherwise lingering sockets hold the event loop open.
      httpAgent: new http.Agent({ keepAlive: false }),
      httpsAgent: new https.Agent({ keepAlive: false }),
      // Do not throw on non-2xx; we handle status ourselves so error envelopes
      // surface API-provided messages (rate limit, validation, etc).
      validateStatus: () => true,
    });
  }

  async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<ApiResult<T>> {
    return this.request<T>({ method: 'GET', url: path, params: clean(params) });
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>({ method: 'POST', url: path, data: body });
  }

  private async request<T>(cfg: AxiosRequestConfig): Promise<ApiResult<T>> {
    if (this.verbose) {
      process.stderr.write(`→ ${cfg.method} ${cfg.url} ${JSON.stringify(cfg.params || cfg.data || {})}\n`);
    }
    let res: AxiosResponse;
    try {
      res = await this.http.request(cfg);
    } catch (err: any) {
      if (err.code === 'ECONNABORTED') {
        throw new CobaltError('TIMEOUT', `Request timed out: ${cfg.method} ${cfg.url}`);
      }
      throw new CobaltError('NETWORK_ERROR', err.message || 'Network error');
    }

    if (this.verbose) {
      process.stderr.write(`← ${res.status} ${cfg.url}\n`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new CobaltError('UNAUTHORIZED', `API key rejected (${res.status}). Check \`cobalt auth status\`.`, { status: res.status, body: res.data, onboarding: onboardingHint('UNAUTHORIZED') });
    }
    if (res.status === 429) {
      const retry = Number(res.headers['retry-after']) || undefined;
      throw new CobaltError('RATE_LIMITED', 'You have exceeded your rate limit.', { retryAfter: retry, body: res.data });
    }
    if (res.status >= 500) {
      throw new CobaltError('SERVER_ERROR', `Cobalt API returned ${res.status}.`, { body: res.data });
    }
    if (res.status >= 400) {
      const msg = (res.data && (res.data.message || res.data.error)) || `HTTP ${res.status}`;
      throw new CobaltError('BAD_REQUEST', String(msg), { status: res.status, body: res.data });
    }

    return { status: res.status, data: res.data as T, headers: res.headers as Record<string, string> };
  }
}

export interface ApiResult<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

function clean(o?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!o) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

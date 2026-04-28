/**
 * Typed errors with machine-readable codes — stable surface for AI agents.
 */
import { emit, envelope } from './output';

export class CobaltError extends Error {
  code: string;
  details?: unknown;
  retryAfter?: number;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
    if (details && typeof details === 'object' && 'retryAfter' in details) {
      this.retryAfter = (details as any).retryAfter;
    }
  }
}

const EXIT_CODES: Record<string, number> = {
  NO_API_KEY: 4,
  UNAUTHORIZED: 4,
  RATE_LIMITED: 3,
  NOT_FOUND: 2,
  BAD_REQUEST: 5,
  TIMEOUT: 6,
  NETWORK_ERROR: 7,
  SERVER_ERROR: 8,
};

export function handleError(err: unknown): never {
  if (err instanceof CobaltError) {
    emit(
      envelope(null, {}, {
        code: err.code,
        message: err.message,
        retry_after_seconds: err.retryAfter,
        details: err.details,
      }),
      { format: process.stdout.isTTY ? 'pretty' : 'json' }
    );
    process.exit(EXIT_CODES[err.code] ?? 1);
  }
  const e = err as Error;
  emit(
    envelope(null, {}, { code: 'UNKNOWN', message: e?.message || String(err) }),
    { format: process.stdout.isTTY ? 'pretty' : 'json' }
  );
  process.exit(1);
}

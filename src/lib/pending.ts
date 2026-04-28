/**
 * Pending retryId persistence.
 *
 * **Why:** The SOS API charges for each search even if the live lookup falls
 * back to a `retryId`. If a user's CLI process dies mid-poll (Ctrl+C, network
 * drop, timeout exceeded, OS reboot) and they didn't capture the retryId, they
 * lose the result they already paid for.
 *
 * Mitigation: every retryId we receive is persisted to disk *immediately* —
 * before polling starts — and removed once the lookup completes successfully.
 * Users can always recover via `cobalt sos pending` + `cobalt sos retry`.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { configPath } from './config';

export interface PendingEntry {
  retryId: string;
  state?: string;
  query?: Record<string, unknown>;
  startedAt: string;
  endpoint?: string;
}

function pendingDir(): string {
  // Sit next to the conf store so users can find it via `cobalt config path`.
  const cfgDir = path.dirname(configPath());
  const dir = path.join(cfgDir, 'pending');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort
  }
  return dir;
}

function safeName(retryId: string): string {
  return retryId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function savePending(entry: PendingEntry): string {
  const dir = pendingDir();
  const file = path.join(dir, `${safeName(entry.retryId)}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(entry, null, 2) + os.EOL, 'utf8');
  } catch (err) {
    // Don't kill the request if disk persistence fails — the stderr surfacing
    // is the primary recovery path. Just log to stderr.
    process.stderr.write(`# warning: could not persist retryId to ${file}: ${(err as Error).message}\n`);
  }
  return file;
}

export function clearPending(retryId: string): void {
  const file = path.join(pendingDir(), `${safeName(retryId)}.json`);
  try {
    fs.unlinkSync(file);
  } catch {
    // not present, ignore
  }
}

export function listPending(): PendingEntry[] {
  const dir = pendingDir();
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: PendingEntry[] = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, n), 'utf8');
      out.push(JSON.parse(raw) as PendingEntry);
    } catch {
      // skip corrupt entries
    }
  }
  // Newest first
  out.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  return out;
}

export function pendingDirPath(): string {
  return pendingDir();
}

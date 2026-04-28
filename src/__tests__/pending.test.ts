import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startFakeServer, FakeServer } from './helpers/fakeServer';

const BIN = path.resolve(__dirname, '../../dist/index.js');

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const proc = spawn('node', [BIN, ...args], { env: { ...process.env, ...env } });
      let stdout = '';
      let stderr = '';
      const t = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('timeout')); }, 15_000);
      t.unref?.();
      proc.stdout.on('data', (c) => (stdout += c.toString()));
      proc.stderr.on('data', (c) => (stderr += c.toString()));
      proc.on('error', (e) => { clearTimeout(t); reject(e); });
      proc.on('close', (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
    }
  );
}

describe('SOS retryId recovery', () => {
  let server: FakeServer;
  let tmpHome: string;
  let envBase: Record<string, string>;

  before(async () => {
    server = await startFakeServer();
  });
  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Each test gets a fresh fake $HOME so the conf store + pending dir are isolated.
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cobalt-cli-test-'));
    envBase = {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      XDG_CONFIG_HOME: path.join(tmpHome, '.config'),
      COBALT_API_KEY: 'k',
      COBALT_ENDPOINT: server.url,
    };
  });

  function pendingDir() {
    return path.join(tmpHome, '.config', 'cobalt-cli-nodejs', 'pending');
  }

  it('persists retryId to disk and surfaces it on stderr BEFORE polling', async () => {
    server.on('/v1/search', () => ({
      status: 200,
      body: { status: 'incomplete', retryId: 'recover-me-123' },
    }));
    // Make polling time out fast so we don't wait 3 minutes.
    const r = await run(
      ['sos', 'search', 'Slow Co', '--state', 'CA', '--format', 'json',
       '--poll-interval', '50', '--poll-max', '2'],
      envBase
    );
    // Should fail with TIMEOUT (exit 6) but retryId is preserved.
    assert.equal(r.status, 6, `expected exit 6, got ${r.status}; stderr=${r.stderr}`);
    // stderr advertises the retryId so a user/agent can recover. The exact
    // format differs between TTY (humans, with chalk) and pipe (machines).
    assert.match(r.stderr, /recover-me-123/);

    // Persisted to disk
    const dir = pendingDir();
    const files = fs.readdirSync(dir);
    assert.ok(files.includes('recover-me-123.json'), `expected recover-me-123.json in ${dir}, got ${files}`);
    const entry = JSON.parse(fs.readFileSync(path.join(dir, 'recover-me-123.json'), 'utf8'));
    assert.equal(entry.retryId, 'recover-me-123');
    assert.equal(entry.state, 'CA');

    // Error envelope includes retryId structurally
    const env = JSON.parse(r.stdout);
    assert.equal(env.error.code, 'TIMEOUT');
    assert.equal((env.error.details as any).retryId, 'recover-me-123');
  });

  it('--async returns retryId AND saves it to disk', async () => {
    server.on('/v1/search', () => ({
      status: 200,
      body: { status: 'incomplete', retryId: 'async-456' },
    }));
    const r = await run(
      ['sos', 'search', 'Slow', '--state', 'CA', '--async', '--format', 'json'],
      envBase
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const env = JSON.parse(r.stdout);
    assert.equal(env.data.retryId, 'async-456');
    assert.equal(env.meta.mode, 'async');
    assert.match(String(env.meta.pendingFile), /async-456\.json$/);

    // On disk
    const files = fs.readdirSync(pendingDir());
    assert.ok(files.includes('async-456.json'));
  });

  it('clears the pending entry once polling completes', async () => {
    let n = 0;
    server.on('/v1/search', () => {
      n += 1;
      if (n === 1) return { status: 200, body: { status: 'incomplete', retryId: 'completes-789' } };
      return { status: 200, body: { status: 'complete', results: [{ sosId: '1' }] } };
    });
    const r = await run(
      ['sos', 'search', 'Done', '--state', 'UT', '--format', 'json',
       '--poll-interval', '50', '--poll-max', '5'],
      envBase
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const env = JSON.parse(r.stdout);
    assert.equal(env.data.status, 'complete');

    // Pending entry was created and then cleared
    const dir = pendingDir();
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      assert.ok(!files.includes('completes-789.json'), `expected completes-789.json removed, got ${files}`);
    }
  });

  it('cobalt sos pending list shows saved retryIds', async () => {
    // Pre-populate a pending entry by running an --async search
    server.on('/v1/search', () => ({
      status: 200,
      body: { status: 'incomplete', retryId: 'listed-001' },
    }));
    await run(['sos', 'search', 'X', '--state', 'UT', '--async', '--format', 'json'], envBase);

    const r = await run(['sos', 'pending', '--format', 'json'], envBase);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const env = JSON.parse(r.stdout);
    assert.equal(env.meta.count, 1);
    assert.equal((env.data as any[])[0].retryId, 'listed-001');
  });

  it('cobalt sos pending clear forgets a saved retryId', async () => {
    server.on('/v1/search', () => ({
      status: 200,
      body: { status: 'incomplete', retryId: 'clear-me-001' },
    }));
    await run(['sos', 'search', 'X', '--state', 'UT', '--async', '--format', 'json'], envBase);
    let entries = JSON.parse(
      (await run(['sos', 'pending', '--format', 'json'], envBase)).stdout
    );
    assert.equal(entries.meta.count, 1);

    const r = await run(['sos', 'pending', 'clear', 'clear-me-001', '--format', 'json'], envBase);
    assert.equal(r.status, 0);
    entries = JSON.parse(
      (await run(['sos', 'pending', '--format', 'json'], envBase)).stdout
    );
    assert.equal(entries.meta.count, 0);
  });
});

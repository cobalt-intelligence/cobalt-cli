import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { startFakeServer, FakeServer } from './helpers/fakeServer';

const BIN = path.resolve(__dirname, '../../dist/index.js');

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Async spawn — required because spawnSync would block the parent event loop,
 * preventing our in-process fake HTTP server from accepting connections.
 */
function run(args: string[], env: Record<string, string> = {}, opts: { closeStdin?: boolean } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [BIN, ...args], {
      env: { ...process.env, ...env },
    });
    if (opts.closeStdin) proc.stdin.end();
    let stdout = '';
    let stderr = '';
    // Watchdog must be cleared on close/error so it doesn't keep the test
    // runner's event loop alive after a quick CLI run finishes. unref() so
    // even if we somehow miss clearing it, the process can still exit.
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('CLI subprocess timed out'));
    }, 10_000);
    timeout.unref?.();
    const clearWatchdog = () => clearTimeout(timeout);
    proc.stdout.on('data', (c) => (stdout += c.toString()));
    proc.stderr.on('data', (c) => (stderr += c.toString()));
    proc.on('error', (err) => {
      clearWatchdog();
      reject(err);
    });
    proc.on('close', (status) => {
      clearWatchdog();
      resolve({ status, stdout, stderr });
    });
  });
}

describe('CLI integration', () => {
  let server: FakeServer;
  before(async () => { server = await startFakeServer(); });
  after(async () => { await server.close(); });

  it('--version prints the version', async () => {
    const r = await run(['--version']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^\d+\.\d+\.\d+/);
  });

  it('exits 4 with NO_API_KEY when no key is set', async () => {
    const r = await run(['sos', 'search', 'Acme', '--state', 'UT', '--format', 'json'], {
      COBALT_API_KEY: '',
    });
    assert.equal(r.status, 4);
    const env = JSON.parse(r.stdout);
    assert.equal(env.error.code, 'NO_API_KEY');
    // Onboarding hint must be present and machine-readable so AI agents
    // can hand actionable steps to their human.
    assert.ok(env.error.details?.onboarding, 'onboarding hint missing');
    const o = env.error.details.onboarding;
    assert.match(o.signup_url, /^https?:\/\//);
    assert.match(o.key_url, /^https?:\/\//);
    assert.match(o.docs_url, /^https?:\/\//);
    assert.match(o.human_action, /sign up/i);
    assert.match(o.human_action, /cobalt auth login/);
  });

  it('exits 4 with UNAUTHORIZED + onboarding hint when API rejects the key', async () => {
    server.on('/v1/search', () => ({ status: 401, body: { message: 'bad key' } }));
    const r = await run(['sos', 'search', 'Acme', '--state', 'UT', '--format', 'json'], {
      COBALT_API_KEY: 'wrong',
      COBALT_ENDPOINT: server.url,
    });
    assert.equal(r.status, 4);
    const env = JSON.parse(r.stdout);
    assert.equal(env.error.code, 'UNAUTHORIZED');
    assert.ok(env.error.details?.onboarding, 'onboarding hint missing');
    assert.match(env.error.details.onboarding.human_action, /rejected/i);
  });

  it('auth login (no --key, empty stdin) prints onboarding URLs to stderr before prompting', async () => {
    const r = await run(['auth', 'login', '--format', 'json'], { COBALT_API_KEY: '' }, { closeStdin: true });
    // No key on stdin → the masked prompt gets EOF and exits with NO_KEY_PROVIDED.
    // The important assertion is that stderr contained the URLs before the prompt.
    assert.match(r.stderr, /Sign up:.*cobaltintelligence/);
    assert.match(r.stderr, /Dashboard:.*cobaltintelligence/);
  });

  it('auth urls prints onboarding URLs for AI agents', async () => {
    const r = await run(['auth', 'urls', '--format', 'json']);
    assert.equal(r.status, 0);
    const env = JSON.parse(r.stdout);
    assert.match(env.data.signup, /^https?:\/\//);
    assert.match(env.data.keys, /^https?:\/\//);
    assert.match(env.data.docs, /^https?:\/\//);
    assert.match(env.data.human_action, /cobalt auth login/);
  });

  it('auth urls honors COBALT_SIGNUP_URL override', async () => {
    const r = await run(['auth', 'urls', '--format', 'json'], {
      COBALT_SIGNUP_URL: 'https://staging.example.com/signup',
    });
    assert.equal(r.status, 0);
    const env = JSON.parse(r.stdout);
    assert.equal(env.data.signup, 'https://staging.example.com/signup');
  });

  it('auth setup in non-TTY without --key emits SETUP_REQUIRED envelope and exits 0', async () => {
    const r = await run(['auth', 'setup', '--no-open', '--format', 'json'], {
      COBALT_API_KEY: '',
    });
    assert.equal(r.status, 0);
    const env = JSON.parse(r.stdout);
    assert.equal(env.error.code, 'SETUP_REQUIRED');
    assert.ok(env.error.details?.onboarding);
  });

  it('exits 5 with BAD_REQUEST when neither query nor identity flags are given', async () => {
    const r = await run(['sos', 'search', '--state', 'UT', '--format', 'json'], {
      COBALT_API_KEY: 'k',
      COBALT_ENDPOINT: server.url,
    });
    assert.equal(r.status, 5);
    const env = JSON.parse(r.stdout);
    assert.equal(env.error.code, 'BAD_REQUEST');
  });

  it('emits the standard envelope on a successful sos search', async () => {
    server.on('/v1/search', () => ({
      status: 200,
      body: {
        status: 'complete',
        statusCode: 200,
        results: [{ title: 'ACME HOLDINGS LLC', sosId: '12345', state: 'UT' }],
      },
    }));
    const r = await run(['sos', 'search', 'Acme', '--state', 'UT', '--format', 'json'], {
      COBALT_API_KEY: 'k',
      COBALT_ENDPOINT: server.url,
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const env = JSON.parse(r.stdout);
    assert.equal(env.error, null);
    assert.equal(env.data.results[0].sosId, '12345');
    assert.equal(env.meta.state, 'UT');
  });

  it('returns retryId immediately when --async is passed', async () => {
    server.on('/v1/search', () => ({
      status: 200,
      body: { status: 'incomplete', retryId: 'pending-abc' },
    }));
    const r = await run(['sos', 'search', 'Slow', '--state', 'CA', '--async', '--format', 'json'], {
      COBALT_API_KEY: 'k',
      COBALT_ENDPOINT: server.url,
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const env = JSON.parse(r.stdout);
    assert.equal(env.data.retryId, 'pending-abc');
    assert.equal(env.meta.mode, 'async');
  });

  it('forwards --test to the API as a query param', async () => {
    server.requests.length = 0;
    server.on('/v1/search', () => ({
      status: 200,
      body: { status: 'complete', results: [] },
    }));
    const r = await run(
      ['sos', 'search', 'Anything', '--state', 'UT', '--test', 'complete', '--format', 'json'],
      { COBALT_API_KEY: 'k', COBALT_ENDPOINT: server.url }
    );
    assert.equal(r.status, 0);
    const last = server.requests.at(-1)!;
    assert.match(last.url, /test=complete/);
  });

  it('OFAC search hits /ofac with the right params', async () => {
    server.requests.length = 0;
    server.on('/ofac', () => ({
      status: 200,
      body: { name: 'Acme', matchCount: 0, matches: [] },
    }));
    const r = await run(
      ['ofac', 'search', 'Acme', '--type', 'organization', '--score', '95', '--format', 'json'],
      { COBALT_API_KEY: 'k', COBALT_ENDPOINT: server.url }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const last = server.requests.at(-1)!;
    assert.match(last.url, /searchQuery=Acme/);
    assert.match(last.url, /searchType=organization/);
    assert.match(last.url, /score=95/);
  });

  it('TIN verify hits /tinVerification', async () => {
    server.requests.length = 0;
    server.on('/tinVerification', () => ({
      status: 200,
      body: { name: 'Acme', tin: '123456789', status: 'TIN Matched', irsCode: 0 },
    }));
    const r = await run(
      ['tin', 'verify', '--tin', '123456789', '--name', 'Acme', '--format', 'json'],
      { COBALT_API_KEY: 'k', COBALT_ENDPOINT: server.url }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const last = server.requests.at(-1)!;
    assert.match(last.url, /tin=123456789/);
    assert.match(last.url, /businessName=Acme/);
  });

  it('full-verification start POSTs initVerification', async () => {
    server.requests.length = 0;
    server.on('/fullVerification', () => ({
      status: 200,
      body: { message: 'Verification started', searchGuid: 'acme#guid' },
    }));
    const r = await run(
      ['fv', 'start', '--business-name', 'Acme', '--format', 'json'],
      { COBALT_API_KEY: 'k', COBALT_ENDPOINT: server.url }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const env = JSON.parse(r.stdout);
    assert.equal(env.data.searchGuid, 'acme#guid');
    const last = server.requests.at(-1)!;
    assert.equal(last.method, 'POST');
    const body = JSON.parse(last.body);
    assert.equal(body.action, 'initVerification');
    assert.equal(body.businessName, 'Acme');
  });

  it('exits 3 with RATE_LIMITED on 429', async () => {
    server.on('/ofac', () => ({
      status: 429,
      body: { message: 'slow down' },
      headers: { 'retry-after': '5' },
    }));
    const r = await run(['ofac', 'search', 'X', '--format', 'json'], {
      COBALT_API_KEY: 'k',
      COBALT_ENDPOINT: server.url,
    });
    assert.equal(r.status, 3);
    const env = JSON.parse(r.stdout);
    assert.equal(env.error.code, 'RATE_LIMITED');
    assert.equal(env.error.retry_after_seconds, 5);
  });
});

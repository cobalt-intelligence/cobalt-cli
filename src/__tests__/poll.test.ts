import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeServer, FakeServer } from './helpers/fakeServer';
import { CobaltClient } from '../lib/client';
import { pollSosRetry } from '../lib/poll';
import { CobaltError } from '../lib/errors';

describe('pollSosRetry', () => {
  let server: FakeServer;
  before(async () => { server = await startFakeServer(); });
  after(async () => { await server.close(); });

  it('returns the body once status flips to complete', async () => {
    let n = 0;
    server.on('/v1/search', () => {
      n += 1;
      if (n < 3) return { status: 200, body: { status: 'incomplete', retryId: 'r1' } };
      return { status: 200, body: { status: 'complete', results: [{ sosId: '1' }] } };
    });

    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    const out = await pollSosRetry(client, 'r1', { intervalMs: 5, maxAttempts: 10 });
    assert.equal((out as any).status, 'complete');
    assert.equal(n, 3);
  });

  it('throws TIMEOUT when never completes within maxAttempts', async () => {
    server.on('/v1/search', () => ({
      status: 200,
      body: { status: 'incomplete', retryId: 'r2' },
    }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    await assert.rejects(
      () => pollSosRetry(client, 'r2', { intervalMs: 5, maxAttempts: 3 }),
      (err: any) => err instanceof CobaltError && err.code === 'TIMEOUT'
    );
  });

  it('forwards screenshot=true on poll requests', async () => {
    let saw = false;
    server.on('/v1/search', (req) => {
      if ((req.url || '').includes('screenshot=true')) saw = true;
      return { status: 200, body: { status: 'complete' } };
    });
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    await pollSosRetry(client, 'r3', { intervalMs: 1, maxAttempts: 2, screenshot: true });
    assert.ok(saw, 'expected screenshot=true on polled request');
  });
});

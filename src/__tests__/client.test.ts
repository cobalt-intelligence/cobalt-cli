import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeServer, FakeServer } from './helpers/fakeServer';
import { CobaltClient } from '../lib/client';
import { CobaltError } from '../lib/errors';

describe('CobaltClient', () => {
  let server: FakeServer;

  before(async () => {
    server = await startFakeServer();
  });
  after(async () => {
    await server.close();
  });

  it('sends x-api-key header and surfaces 200 JSON', async () => {
    server.on('/v1/search', () => ({
      status: 200,
      body: { status: 'complete', results: [{ sosId: '123' }] },
    }));
    const client = new CobaltClient({ apiKey: 'test-key', endpoint: server.url });
    const res = await client.get<any>('/v1/search', { searchQuery: 'Acme', state: 'UT' });
    assert.equal(res.status, 200);
    assert.equal(res.data.results[0].sosId, '123');

    const last = server.requests.at(-1)!;
    assert.equal(last.headers['x-api-key'], 'test-key');
    assert.match(last.url, /searchQuery=Acme/);
    assert.match(last.url, /state=UT/);
  });

  it('strips undefined/null/empty params from the query string', async () => {
    server.on('/v1/search', () => ({ status: 200, body: { ok: true } }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    await client.get('/v1/search', { a: 'x', b: undefined, c: null, d: '' });
    const last = server.requests.at(-1)!;
    assert.match(last.url, /a=x/);
    assert.doesNotMatch(last.url, /b=/);
    assert.doesNotMatch(last.url, /c=/);
    assert.doesNotMatch(last.url, /d=/);
  });

  it('maps 401 to UNAUTHORIZED', async () => {
    server.on('/v1/search', () => ({ status: 401, body: { message: 'nope' } }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    await assert.rejects(
      () => client.get('/v1/search'),
      (err: any) => err instanceof CobaltError && err.code === 'UNAUTHORIZED'
    );
  });

  it('maps 403 to UNAUTHORIZED', async () => {
    server.on('/v1/search', () => ({ status: 403, body: { message: 'forbidden' } }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    await assert.rejects(
      () => client.get('/v1/search'),
      (err: any) => err.code === 'UNAUTHORIZED'
    );
  });

  it('maps 429 to RATE_LIMITED with retryAfter', async () => {
    server.on('/v1/search', () => ({
      status: 429,
      body: { message: 'slow down' },
      headers: { 'retry-after': '42' },
    }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    await assert.rejects(
      () => client.get('/v1/search'),
      (err: any) => err.code === 'RATE_LIMITED' && err.retryAfter === 42
    );
  });

  it('maps 500 to SERVER_ERROR', async () => {
    server.on('/v1/search', () => ({ status: 500, body: { message: 'boom' } }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    await assert.rejects(
      () => client.get('/v1/search'),
      (err: any) => err.code === 'SERVER_ERROR'
    );
  });

  it('maps 400 to BAD_REQUEST and surfaces API message', async () => {
    server.on('/v1/search', () => ({
      status: 400,
      body: { message: 'state is required' },
    }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    await assert.rejects(
      () => client.get('/v1/search'),
      (err: any) => err.code === 'BAD_REQUEST' && /state is required/.test(err.message)
    );
  });

  it('throws NO_API_KEY when none is configured', async () => {
    const oldEnv = process.env.COBALT_API_KEY;
    delete process.env.COBALT_API_KEY;
    try {
      assert.throws(
        () => new CobaltClient({ endpoint: server.url }),
        (err: any) => err instanceof CobaltError && err.code === 'NO_API_KEY'
      );
    } finally {
      if (oldEnv) process.env.COBALT_API_KEY = oldEnv;
    }
  });

  it('POSTs JSON bodies', async () => {
    server.on('/fullVerification', () => ({
      status: 200,
      body: { message: 'Verification started', searchGuid: 'abc#xyz' },
    }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url });
    const res = await client.post<any>('/fullVerification', {
      action: 'initVerification',
      businessName: 'Acme',
    });
    assert.equal(res.data.searchGuid, 'abc#xyz');
    const last = server.requests.at(-1)!;
    assert.equal(last.method, 'POST');
    assert.deepEqual(JSON.parse(last.body), { action: 'initVerification', businessName: 'Acme' });
  });

  it('honors a short timeout', async () => {
    server.on('/slow', () => ({ status: 200, body: { ok: true }, delayMs: 200 }));
    const client = new CobaltClient({ apiKey: 'k', endpoint: server.url, timeoutMs: 50 });
    await assert.rejects(
      () => client.get('/slow'),
      (err: any) => err.code === 'TIMEOUT'
    );
  });
});

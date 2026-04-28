import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CobaltError } from '../lib/errors';

describe('CobaltError', () => {
  it('carries a stable code and message', () => {
    const e = new CobaltError('RATE_LIMITED', 'slow down', { retryAfter: 30 });
    assert.equal(e.code, 'RATE_LIMITED');
    assert.equal(e.message, 'slow down');
    assert.equal(e.retryAfter, 30);
  });

  it('defaults retryAfter to undefined when not supplied', () => {
    const e = new CobaltError('BAD_REQUEST', 'invalid');
    assert.equal(e.retryAfter, undefined);
  });

  it('is an instanceof Error (so try/catch works)', () => {
    const e = new CobaltError('X', 'y');
    assert.ok(e instanceof Error);
  });
});

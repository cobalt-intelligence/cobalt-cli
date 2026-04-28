import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { envelope } from '../lib/output';

describe('envelope', () => {
  it('wraps data in the standard shape', () => {
    const e = envelope({ hello: 'world' }, { state: 'UT' });
    assert.deepEqual(e, {
      data: { hello: 'world' },
      meta: { state: 'UT' },
      error: null,
    });
  });

  it('wraps null data with an error payload', () => {
    const e = envelope(null, {}, { code: 'NOT_FOUND', message: 'gone' });
    assert.equal(e.data, null);
    assert.equal(e.error?.code, 'NOT_FOUND');
  });

  it('defaults meta and error', () => {
    const e = envelope({ a: 1 });
    assert.deepEqual(e.meta, {});
    assert.equal(e.error, null);
  });
});

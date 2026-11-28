import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/realtime/route.ts';

test('legacy voice endpoint cannot issue unmetered credentials', async t => {
  const network = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call provider'); });
  const response = await POST();
  assert.equal(response.status, 410);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).code, 'legacy_voice_disabled');
  assert.equal(network.mock.callCount(), 0);
});

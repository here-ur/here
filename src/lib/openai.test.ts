import test from 'node:test';
import assert from 'node:assert/strict';
import { openai, failed, VoiceProviderError } from './openai.ts';

test('provider quota is preserved without logging its private error message or retrying', async t => {
  const before = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-key';
  t.after(() => { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before; });
  const logs: string[] = [];
  t.mock.method(console, 'info', (line: string) => logs.push(line));
  t.mock.method(console, 'warn', (line: string) => logs.push(line));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return Response.json({ error: { code: 'insufficient_quota', message: 'billing quota for private-account-id' } }, {status:429});
  });
  let error: unknown;
  try { await openai('live/sessions', {method:'POST'}); } catch (e) { error = e; }
  assert.ok(error instanceof VoiceProviderError);
  assert.equal(requests, 1);
  const response = failed(error);
  assert.equal(response.status, 429);
  assert.deepEqual(Object.keys(await response.json()), ['error']);
  assert.ok(logs.some(line => JSON.parse(line).kind === 'quota'));
  assert.ok(logs.every(line => !line.includes('private-account-id') && !line.includes('synthetic-key')));
});

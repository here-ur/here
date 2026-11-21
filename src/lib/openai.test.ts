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
  const body = await response.json();
  assert.equal(body.code, 'voice_provider_quota');
  assert.match(body.error, /서비스 이용 한도/);
  assert.doesNotMatch(body.error, /잠시 후|private-account-id/);
  assert.ok(logs.some(line => JSON.parse(line).kind === 'quota'));
  assert.ok(logs.every(line => !line.includes('private-account-id') && !line.includes('synthetic-key')));
});

for (const [detail, kind, code] of [
  [{ type: 'insufficient_quota', code: null, message: '' }, 'quota', 'voice_provider_quota'],
  [{ code: 'project_spend_limit_exceeded', message: '' }, 'quota', 'voice_provider_quota'],
  [{ code: 'rate_limit_exceeded', message: 'requests per minute' }, 'rate_limit', 'voice_provider_busy'],
  [{ message: 'too many concurrent sessions' }, 'concurrency', 'voice_provider_busy'],
] as const) {
  test(`provider 429 ${kind} produces the corresponding public code`, async t => {
    const before = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'synthetic-key';
    t.after(() => { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before; });
    t.mock.method(console, 'info', () => {}); t.mock.method(console, 'warn', () => {});
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: detail }, {status:429}));
    await assert.rejects(openai('live/sessions', {}), asyncError => {
      assert.ok(asyncError instanceof VoiceProviderError); assert.equal(asyncError.kind, kind);
      return true;
    });
    assert.equal((await failed(new VoiceProviderError(429, kind)).json()).code, code);
  });
}

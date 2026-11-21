import test from 'node:test';
import assert from 'node:assert/strict';
import { failed, VoiceProviderError } from './openai.ts';
import { LiveConnectionError } from './live.ts';

test('billing quota survives the server/client boundary and retains the no-retry status', async t => {
  t.mock.method(console, 'info', () => {});
  const error = await LiveConnectionError.fromResponse(failed(new VoiceProviderError(429, 'quota')));
  assert.equal(error.status, 429);
  assert.match(error.message, /음성 서비스 이용 한도/);
  assert.doesNotMatch(error.message, /잠시 후|OpenAI|billing|quota/);
});

test('temporary capacity and member quota are distinct from provider billing quota', async () => {
  const busy = await LiveConnectionError.fromResponse(Response.json({code:'voice_provider_busy'}, {status:429}));
  const member = await LiveConnectionError.fromResponse(Response.json({error:'member usage limit'}, {status:429}));
  assert.match(busy.message, /몰리고/);
  assert.match(member.message, /대화 이용 한도/);
  assert.notEqual(busy.message, member.message);
});

test('unrecognized/malformed responses never expose raw provider errors', async () => {
  for (const response of [
    Response.json({code:'unknown',error:'secret-provider-account'}, {status:502}),
    Response.json({code:'__proto__',error:'secret-provider-account'}, {status:502}),
    new Response('<html>secret-provider-account</html>', {status:502}),
  ]) {
    const error = await LiveConnectionError.fromResponse(response);
    assert.equal(error.status, 502);
    assert.match(error.message, /음성 대화를 연결하지 못했어요/);
    assert.doesNotMatch(error.message, /secret-provider-account/);
  }
});

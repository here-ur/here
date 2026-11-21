import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoicePreparationOwner, voiceProfileKey } from './voice-preparation-owner.ts';

function setup() {
  const connections: { disposed: number }[] = [];
  const owner = createVoicePreparationOwner(() => {
    const connection = { disposed: 0 };
    connections.push(connection);
    return { dispose() { connection.disposed++; }, async claim() { throw Error('not needed by owner'); } };
  });
  return { owner, connections };
}
test('entry and home share exactly one connection; entry cleanup cannot close the handed-off call', () => {
  const { owner, connections } = setup();
  owner.prepare('user-a', 'profile-a', async () => 'token');
  owner.prepare('user-a', 'profile-a', async () => 'refreshed');
  assert.equal(connections.length, 1);
  const claimed = owner.take('user-a', 'profile-a');
  assert.ok(claimed);
  owner.clear();
  assert.equal(connections[0].disposed, 0);
  assert.equal(owner.take('user-a', 'profile-a'), null);
  claimed.dispose();
  assert.equal(connections[0].disposed, 1);
});
test('account and profile changes dispose stale connections instead of handing them to another context', () => {
  for (const [id, profile] of [['user-b','profile-a'],['user-a','profile-b']]) {
    const { owner, connections } = setup();
    owner.prepare('user-a', 'profile-a', async () => 'token');
    assert.equal(owner.take(id, profile), null);
    assert.equal(connections[0].disposed, 1);
  }
});
test('leaving during entry disposes the unused connection once; replacement disposes the previous account', () => {
  const { owner, connections } = setup();
  owner.prepare('user-a', 'profile-a', async () => 'token');
  owner.prepare('user-b', 'profile-b', async () => 'token');
  owner.clear(); owner.clear();
  assert.deepEqual(connections.map(c => c.disposed), [1,1]);
});
test('profile comparison tolerates normalization but rejects changed onboarding answers', () => {
  assert.equal(voiceProfileKey('후추', undefined), voiceProfileKey('후추', {}));
  assert.equal(voiceProfileKey('후추', {support:'있어요',lately:'조금 지쳤어요'}), voiceProfileKey('후추', {lately:'조금 지쳤어요',support:'있어요'}));
  assert.notEqual(voiceProfileKey('후추', {support:'있어요'}), voiceProfileKey('후추', {support:'지금은 없어요'}));
});

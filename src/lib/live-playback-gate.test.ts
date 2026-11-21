import test from 'node:test';
import assert from 'node:assert/strict';
import { livePlaybackGate } from './live-playback-gate.ts';

const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
test('음성은 컨텍스트 전달 ACK만으로 재개하지 않고 이전 음성의 조용한 경계를 기다린다', async () => {
  let now = 0;
  const muted: boolean[] = [], instructions: string[] = [];
  let delivered!: () => void;
  const gate = livePlaybackGate({ mute: b => muted.push(b), instruction: text => instructions.push(text), append: () => new Promise<void>(r => { delivered = r; }) }, () => now);
  gate.begin();
  assert.deepEqual(muted, [true]);
  const done = gate.apply({ tone_guidance: '차분하게' }, new AbortController().signal);
  gate.observe(false); now += 300; gate.observe(false);
  assert.deepEqual(muted, [true], '조회 중 무음이어도 재개하지 않음');
  delivered(); await tick();
  assert.deepEqual(muted, [true], 'ACK는 재생 허가가 아님');
  gate.observe(true); now += 100; gate.observe(false); now += 100; gate.observe(false);
  assert.deepEqual(muted, [true]);
  now += 100; gate.observe(false); await done;
  assert.deepEqual(muted, [true, false]);
  assert.match(instructions.at(-1)!, /최신 사용자 맥락/);
});
test('새 발화와 통화 종료는 이전 맥락의 늦은 재생 허가를 무효화한다', async () => {
  for (const close of [false, true]) {
    let now = 0;
    const muted: boolean[] = [];
    const gate = livePlaybackGate({ mute: b => muted.push(b), instruction: () => {}, append: async () => {} }, () => now);
    gate.begin();
    const waiting = gate.apply({}, new AbortController().signal);
    await tick();
    const rejected = assert.rejects(waiting, /superseded/);
    if (close) gate.close(); else gate.begin();
    now = 1000; gate.observe(false);
    await rejected;
    assert.ok(!muted.includes(false));
  }
});
test('조회 취소·전달 실패에서는 소리를 재개하지 않는다', async () => {
  const muted: boolean[] = [];
  const gate = livePlaybackGate({ mute: b => muted.push(b), instruction: () => {}, append: async () => { throw Error('delivery_failed'); } });
  gate.begin();
  await assert.rejects(gate.apply({}, new AbortController().signal), /delivery_failed/);
  assert.deepEqual(muted, [true]);
});

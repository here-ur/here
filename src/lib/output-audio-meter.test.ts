import test from "node:test";
import assert from "node:assert/strict";
import { createOutputAudioMeter, speechEnvelope } from "./output-audio-meter.ts";

test("speech envelope opens with actual energy, rejects noise and closes between phrases", () => {
  const silent = new Float32Array(512);
  const noise = new Float32Array(512).fill(.004);
  const quiet = new Float32Array(512).fill(.025);
  const loud = new Float32Array(512).fill(.2);
  assert.equal(speechEnvelope(silent, 0, 16), 0);
  assert.equal(speechEnvelope(noise, 0, 16), 0);
  assert.ok(speechEnvelope(loud, 0, 16) > speechEnvelope(quiet, 0, 16));
  let level = 0;
  for (let i = 0; i < 6; i++) level = speechEnvelope(loud, level, 16);
  assert.ok(level > .9 && level <= 1);
  for (let i = 0; i < 20; i++) level = speechEnvelope(silent, level, 16);
  assert.equal(level, 0);
});

test("output tap preserves playback, gates mute/pause, closes context and cancels frames", t => {
  const replacements: Record<string, unknown> = {};
  const listeners = new Map<string, Set<() => void>>();
  let next = 0, closeCount = 0, disconnects = 0, connections = 0;
  const frames = new Map<number, (time: number) => void>();
  const doc = { hidden: false, addEventListener(name: string, fn: () => void) { const list = listeners.get(name) ?? new Set(); list.add(fn); listeners.set(name, list); }, removeEventListener(name: string, fn: () => void) { listeners.get(name)?.delete(fn); } };
  const analyser = { fftSize: 512, getFloatTimeDomainData(data: Float32Array) { data.fill(.1); }, disconnect() { disconnects++; } };
  const source = { connect(target: unknown) { assert.equal(target, analyser); connections++; }, disconnect() { disconnects++; } };
  class Context {
    state = "running";
    createAnalyser() { return analyser; }
    createMediaStreamSource(stream: unknown) { assert.equal(stream, remote); return source; }
    async resume() { this.state = "running"; }
    async close() { closeCount++; }
  }
  const remote = { marker: "remote playback only" } as unknown as MediaStream;
  const audio = { paused: false, muted: false, volume: 1 } as HTMLAudioElement;
  Object.assign(replacements, { AudioContext: Context, document: doc, requestAnimationFrame: (fn: (time: number) => void) => { frames.set(++next, fn); return next; }, cancelAnimationFrame: (id: number) => frames.delete(id) });
  for (const [key, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); });
  }
  let level = 0, time = 0;
  const tick = () => { time += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); };
  const meter = createOutputAudioMeter(value => { level = value; });
  meter.attach(remote, audio);
  tick(); assert.equal(level, 0);
  meter.setEnabled(true); tick(); assert.ok(level > 0);
  audio.muted = true; tick(); assert.equal(level, 0);
  audio.muted = false; tick(); assert.ok(level > 0);
  Object.defineProperty(audio, "paused", { configurable: true, value: true });
  tick(); assert.equal(level, 0);
  Object.defineProperty(audio, "paused", { configurable: true, value: false });
  tick(); doc.hidden = true; tick(); assert.equal(level, 0);
  doc.hidden = false; tick(); assert.ok(level > 0);
  meter.setEnabled(false); assert.equal(level, 0);
  meter.close(); meter.close();
  assert.equal(closeCount, 1); assert.equal(connections, 1); assert.equal(disconnects, 2);
  assert.equal(frames.size, 0); assert.ok([...listeners.values()].every(set => set.size === 0));
  meter.attach(remote, audio); assert.equal(frames.size, 0);
});

test("unsupported audio analysis remains a silent, disposable visual fallback", () => {
  const levels: number[] = [];
  const meter = createOutputAudioMeter(level => levels.push(level));
  meter.attach({} as MediaStream, {} as HTMLAudioElement);
  meter.setEnabled(true); meter.close();
  assert.deepEqual(levels, [0]);
});

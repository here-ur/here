import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { connectLive } from "./live.ts";
import type { Handlers } from "./realtime.ts";
import { prewarmLiveTransport, takeLiveTransport } from './live-transport.ts';

function setup(t: TestContext, fail = false, media?: () => Promise<unknown>, permission?: PermissionState) {
  function global(name: string, value: unknown) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name); });
  }
  const track = { enabled: true, stops: 0, stop() { this.stops++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const sent: Record<string, unknown>[] = [];
  const users: string[] = [];
  const channel = {
    readyState: "open", onmessage: null as null | ((e: { data: string }) => void), onclose: null, onerror: null,
    send(data: string) { sent.push(JSON.parse(data)); }, close() { this.readyState = "closed"; },
  };
  const emit = (event: object) => channel.onmessage?.({ data: JSON.stringify(event) });
  let peerClosed = false;
  class Peer {
    // ICE gathering deliberately never completes: startup must not wait for it.
    iceGatheringState = "gathering";
    localDescription = { sdp: "v=0\r\no=test" };
    createDataChannel(_label: string, options: RTCDataChannelInit) { assert.deepEqual(options, { negotiated: true, id: 4 }); return channel; }
    addTrack() { assert.equal(track.enabled, false); }
    addTransceiver() { return { sender: { async replaceTrack(value: typeof track) { assert.equal(value, track); assert.equal(track.enabled, false); } } }; }
    async createOffer() { return { type: "offer", sdp: this.localDescription.sdp }; }
    async setLocalDescription() {}
    async setRemoteDescription(answer: { type: string; sdp: string }) {
      assert.equal(answer.sdp, "v=0\r\no=answer");
      emit({ type: "session.started", session: { id: "live_test" } });
    }
    close() { peerClosed = true; }
  }
  global("RTCPeerConnection", Peer);
  global("Audio", class { muted = false; pause() {} });
  global("navigator", { mediaDevices: { getUserMedia: media || (async () => stream) }, ...(permission ? { permissions: { query: async () => ({ state: permission }) } } : {}) });
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    if (url === "/api/live") return Response.json({ sdp: "v=0\r\no=answer", memory: true }, { status: fail ? 502 : 200 });
    assert.equal(url, "/api/voice-memory");
    return Response.json({ accepted: true }, { status: 202 });
  });
  const handlers: Handlers = { onStatus: () => {}, onError: () => {}, onUserText: s => users.push(s),
    onUserPartial: () => {}, onAssistantPartial: () => {}, onAssistantText: () => {}, onTool: () => {} };
  return { track, stream, emit, requests, sent, users, handlers, peerClosed: () => peerClosed };
}

test("Live exchanges SDP through authenticated app route and sends no Realtime commands", async t => {
  const m = setup(t);
  const rt = await connectLive(m.handlers, { name: "보리" }, undefined, "test-token", {});
  assert.equal(m.requests[0].url, "/api/live");
  assert.deepEqual(m.requests[0].body, { sdp: "v=0\r\no=test", dcid: 4 });
  assert.equal(m.track.enabled, true);
  assert.deepEqual(m.sent.map(e => e.type), ["session.input_audio.unmute"]);
  rt.setMic(false); assert.equal(m.track.enabled, false);
  assert.equal(m.sent.at(-1)?.type, "session.input_audio.mute");
  rt.close();
  assert.equal(m.sent.at(-1)?.type, "session.close");
  assert.equal(m.peerClosed(), false);
  m.emit({ type: "session.closed" });
  assert.equal(m.peerClosed(), true); assert.equal(m.track.stops, 1);
});
test("close drains the final transcript, saves once, then releases transport", async t => {
  const m = setup(t);
  const rt = await connectLive(m.handlers, {}, undefined, "test-token", {});
  m.emit({ type: "session.input_transcript.delta", event_id: "a", delta: "기타를", start_ms: 0, end_ms: 100 });
  rt.close(); rt.close();
  m.emit({ type: "session.input_transcript.delta", event_id: "b", delta: " 배웠어", start_ms: 100, end_ms: 200 });
  m.emit({ type: "session.closed" });
  assert.deepEqual(m.users, ["기타를 배웠어"]);
  const saves = m.requests.filter(r => r.url === "/api/voice-memory");
  assert.equal(saves.length, 1); assert.equal(saves[0].body.text, "기타를 배웠어");
});
test("failed session exchange stops the acquired microphone", async t => {
  const m = setup(t, true);
  await assert.rejects(connectLive(m.handlers, {}, undefined, "test-token", {}));
  assert.equal(m.peerClosed(), true); assert.equal(m.track.stops, 1);
});
test("synthetic audio uses the same Live transport without opening the device microphone", async t => {
  const m = setup(t, false, async () => { throw new Error("Device microphone must not open"); });
  const rt = await connectLive(m.handlers, {}, undefined, "test-token", { inputStream: m.stream as unknown as MediaStream });
  assert.equal(rt.hasMic, true);
  assert.equal(m.requests[0].url, "/api/live");
  rt.close(); m.emit({type:"session.closed"});
  assert.equal(m.track.stops, 1);
});
test("late microphone permission after cancel never starts a paid session", async t => {
  let resolve!: (value: unknown) => void;
  const m = setup(t, false, () => new Promise(r => { resolve = r; }));
  const controller = new AbortController();
  const connecting = connectLive(m.handlers, {}, controller.signal, "test-token", {});
  controller.abort(); resolve(m.stream);
  await assert.rejects(connecting);
  assert.equal(m.requests.length, 0); assert.equal(m.track.stops, 1);
});

test('already granted microphone permission allows signaling while the device opens', async t => {
  let resolve!: (value: unknown) => void;
  const m = setup(t, false, () => new Promise(r => { resolve = r; }), 'granted');
  const connecting = connectLive(m.handlers, {}, undefined, 'test-token');
  await new Promise(r => setImmediate(r));
  assert.equal(m.requests.length, 1);
  resolve(m.stream);
  const rt = await connecting;
  assert.equal(rt.hasMic, true);
  assert.equal(m.track.enabled, true);
  rt.close(); m.emit({ type: 'session.closed' });
});

test('cancel during parallel signaling stops a microphone that arrives later', async t => {
  let resolve!: (value: unknown) => void;
  const m = setup(t, false, () => new Promise(r => { resolve = r; }), 'granted');
  const controller = new AbortController();
  const connecting = connectLive(m.handlers, {}, controller.signal, 'test-token');
  await new Promise(r => setImmediate(r));
  controller.abort(); resolve(m.stream);
  await assert.rejects(connecting);
  assert.equal(m.track.stops, 1); assert.equal(m.peerClosed(), true);
});

test('browser preparation opens neither a microphone nor a paid session and releases on unmount', t => {
  const m = setup(t, false, async () => { throw Error('preparation must not open the microphone'); });
  const dispose = prewarmLiveTransport();
  assert.equal(m.requests.length, 0); assert.equal(m.peerClosed(), false);
  dispose(); assert.equal(m.peerClosed(), true); assert.equal(takeLiveTransport(), undefined);
});

test('prepared transport still waits for unresolved microphone permission before creating a session', async t => {
  let resolve!: (value: unknown) => void;
  const m = setup(t, false, () => new Promise(r => { resolve = r; }));
  const dispose = prewarmLiveTransport();
  const controller = new AbortController();
  const connecting = connectLive(m.handlers, {}, controller.signal, 'test-token');
  dispose(); // Claimed transport belongs to the connecting call, not the home effect.
  assert.equal(m.peerClosed(), false);
  await new Promise(r => setImmediate(r));
  assert.equal(m.requests.length, 0);
  controller.abort(); resolve(m.stream);
  await assert.rejects(connecting);
  assert.equal(m.track.stops, 1); assert.equal(m.peerClosed(), true);
});

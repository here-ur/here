import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { connectRealtime, type Handlers } from "./realtime.ts";

type SentEvent = {
  type: string;
  response?: {
    output_modalities?: string[];
    instructions?: string;
    metadata?: Record<string, string>;
    tool_choice?: string;
  };
  item?: unknown;
};

class MockTrack {
  enabled = true;
  stopCount = 0;
  kind = "audio";
  stop() { this.stopCount += 1; }
}

class MockStream {
  tracks = [new MockTrack(), new MockTrack()];
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks; }
}

class MockChannel {
  readyState: RTCDataChannelState = "connecting";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: SentEvent[] = [];
  closeCount = 0;
  send(value: string) { this.sent.push(JSON.parse(value) as SentEvent); }
  close() { this.closeCount += 1; this.readyState = "closed"; }
  open() { this.readyState = "open"; this.onopen?.(); }
  emit(event: object) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

class MockAudio {
  autoplay = false;
  muted = false;
  srcObject: unknown = null;
  pauseCount = 0;
  playCount = 0;
  playError: Error | null = null;
  pause() { this.pauseCount += 1; }
  async play() {
    this.playCount += 1;
    if (this.playError) throw this.playError;
  }
}

type SetupFailure = "offer" | "local-description" | "remote-description" | "answer-http" | "answer-network";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function replaceGlobal(t: TestContext, name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}

function setup(t: TestContext, options: {
  media?: () => Promise<MockStream>;
  failure?: SetupFailure;
  sessionStatus?: number;
  playError?: Error;
} = {}) {
  const stream = new MockStream();
  const mediaRequested = deferred<void>();
  const requests: { input: Parameters<typeof fetch>[0]; init?: RequestInit }[] = [];
  const mediaRequests: unknown[] = [];
  const peers: MockPeer[] = [];
  const audios: MockAudio[] = [];
  const statuses: Parameters<Handlers["onStatus"]>[0][] = [];
  const errors: string[] = [];
  const userTexts: string[] = [];
  const assistantTexts: string[] = [];
  const tools: string[] = [];
  const handlers: Handlers = {
    onStatus: (status) => { statuses.push(status); },
    onUserText: (text) => { userTexts.push(text); },
    onUserPartial: () => {},
    onAssistantPartial: () => {},
    onAssistantText: (text) => { assistantTexts.push(text); },
    onTool: (name) => { tools.push(name); },
    onError: (error) => { errors.push(error); },
  };

  class MockPeer {
    channel = new MockChannel();
    connectionState: RTCPeerConnectionState = "new";
    ontrack: ((event: { streams: MockStream[] }) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    addedTracks: { track: MockTrack; enabledAtAdd: boolean }[] = [];
    transceivers: { kind: string; options: RTCRtpTransceiverInit }[] = [];
    closeCount = 0;
    constructor() { peers.push(this); }
    addTrack(track: MockTrack) { this.addedTracks.push({ track, enabledAtAdd: track.enabled }); }
    addTransceiver(kind: string, init: RTCRtpTransceiverInit) { this.transceivers.push({ kind, options: init }); }
    createDataChannel(name: string) { assert.equal(name, "oai-events"); return this.channel; }
    async createOffer() {
      if (options.failure === "offer") throw new Error("mock offer failed");
      return { type: "offer", sdp: "mock-offer-sdp" };
    }
    async setLocalDescription() {
      if (options.failure === "local-description") throw new Error("mock local description failed");
    }
    async setRemoteDescription(value: RTCSessionDescriptionInit) {
      if (options.failure === "remote-description") throw new Error("mock remote description failed");
      assert.deepEqual(value, { type: "answer", sdp: "mock-answer-sdp" });
    }
    close() { this.closeCount += 1; this.connectionState = "closed"; }
  }

  class AudioConstructor extends MockAudio {
    constructor() {
      super();
      this.playError = options.playError ?? null;
      audios.push(this);
    }
  }

  replaceGlobal(t, "RTCPeerConnection", MockPeer);
  replaceGlobal(t, "Audio", AudioConstructor);
  replaceGlobal(t, "navigator", {
    mediaDevices: {
      getUserMedia(constraints: unknown) {
        mediaRequests.push(constraints);
        mediaRequested.resolve();
        return options.media?.() ?? Promise.resolve(stream);
      },
    },
  });
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requests.push({ input, init });
    if (input === "/api/realtime") {
      return Response.json({ key: "mock-ephemeral-key" }, { status: options.sessionStatus ?? 200 });
    }
    assert.equal(input, "https://api.openai.com/v1/realtime/calls", "모든 네트워크 요청은 스텁 내부에서 처리한다");
    if (options.failure === "answer-network") throw new TypeError("mock network failed");
    return new Response("mock-answer-sdp", { status: options.failure === "answer-http" ? 502 : 200 });
  });

  return { stream, mediaRequested, requests, mediaRequests, peers, audios, statuses, errors, userTexts, assistantTexts, tools, handlers };
}

function beginGreeting(channel: MockChannel) {
  channel.open();
  const greeting = channel.sent.find((event) => event.type === "response.create");
  assert.ok(greeting);
  channel.emit({ type: "response.created", response: { id: "greeting-1", metadata: greeting.response?.metadata } });
  return greeting;
}

function finishGreeting(channel: MockChannel) {
  channel.emit({ type: "output_audio_buffer.started", response_id: "greeting-1" });
  channel.emit({ type: "response.done", response: { id: "greeting-1", status: "completed", output: [{ type: "message" }] } });
  channel.emit({ type: "output_audio_buffer.stopped", response_id: "greeting-1" });
}

test("연결 요청과 마이크는 모두 스텁으로 처리하고 트랙을 추가하기 전에 음소거한다", async (t) => {
  const m = setup(t);
  const controller = new AbortController();
  const realtime = await connectRealtime(m.handlers, { name: "몽글이", voice: "marin" }, controller.signal);
  t.after(() => realtime.close());

  assert.equal(realtime.hasMic, true);
  assert.equal(m.requests.length, 2);
  assert.equal(m.requests[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(m.requests[0].init?.body as string), { name: "몽글이", voice: "marin" });
  assert.ok(m.requests.every(({ init }) => init?.signal instanceof AbortSignal));
  assert.equal(m.requests[1].init?.body, "mock-offer-sdp");
  assert.deepEqual(m.mediaRequests, [{ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }]);
  assert.ok(m.peers[0].addedTracks.length > 0);
  assert.ok(m.peers[0].addedTracks.every(({ enabledAtAdd }) => enabledAtAdd === false));
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
  assert.equal(m.statuses[0], "connecting");
});

test("데이터 채널이 열리면 음성 인사를 도구 호출 없이 한 번만 요청한다", async (t) => {
  const m = setup(t);
  const realtime = await connectRealtime(m.handlers);
  t.after(() => realtime.close());
  const channel = m.peers[0].channel;
  const greeting = beginGreeting(channel);
  channel.open();

  assert.equal(channel.sent.filter((event) => event.type === "response.create").length, 1);
  assert.deepEqual(greeting.response?.output_modalities, ["audio"]);
  assert.equal(greeting.response?.tool_choice, "none");
  assert.ok(greeting.response?.instructions?.trim());
  assert.ok(Object.keys(greeting.response?.metadata ?? {}).length > 0);
  assert.equal(m.statuses.at(-1), "thinking");
});

test("인사 생성 완료나 다른 응답의 재생 완료로는 마이크 잠금을 풀지 않는다", async (t) => {
  const m = setup(t);
  const realtime = await connectRealtime(m.handlers);
  t.after(() => realtime.close());
  const channel = m.peers[0].channel;
  beginGreeting(channel);
  realtime.setMic(true);
  channel.emit({ type: "response.done", response: { id: "greeting-1", status: "completed", output: [{ type: "message" }] } });
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
  channel.emit({ type: "output_audio_buffer.stopped", response_id: "not-the-greeting" });
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
  channel.emit({ type: "output_audio_buffer.started", response_id: "greeting-1" });
  assert.equal(m.statuses.at(-1), "speaking");
  channel.emit({ type: "output_audio_buffer.stopped", response_id: "greeting-1" });
  assert.ok(m.stream.tracks.every((track) => track.enabled === true));
  assert.equal(m.statuses.at(-1), "listening");
});

test("인사 중 선택한 마이크 끄기를 재생 완료 이후에도 유지한다", async (t) => {
  const m = setup(t);
  const realtime = await connectRealtime(m.handlers);
  t.after(() => realtime.close());
  beginGreeting(m.peers[0].channel);
  realtime.setMic(false);
  finishGreeting(m.peers[0].channel);
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
  assert.equal(m.statuses.at(-1), "idle");
  realtime.setMic(true);
  assert.ok(m.stream.tracks.every((track) => track.enabled === true));
  realtime.setMic(false);
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
});

test("응답을 기다리는 중 마이크를 꺼도 생각 중 상태를 유지한다", async (t) => {
  const m = setup(t);
  const realtime = await connectRealtime(m.handlers);
  t.after(() => realtime.close());
  const channel = m.peers[0].channel;
  beginGreeting(channel);
  finishGreeting(channel);
  channel.emit({ type: "input_audio_buffer.speech_stopped", item_id: "user-1" });
  assert.equal(m.statuses.at(-1), "thinking");
  realtime.setMic(false);
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
  assert.equal(m.statuses.at(-1), "thinking");
  assert.equal(m.errors.length, 0);
  assert.notEqual(m.peers[0].connectionState, "closed");
});

test("인사 오디오가 중단되면 연결을 정리하고 늦은 재생 완료에도 마이크를 열지 않는다", async (t) => {
  const m = setup(t);
  const realtime = await connectRealtime(m.handlers);
  t.after(() => realtime.close());
  const channel = m.peers[0].channel;
  beginGreeting(channel);
  channel.emit({ type: "output_audio_buffer.started", response_id: "greeting-1" });
  const lateMessage = channel.onmessage;
  channel.emit({ type: "output_audio_buffer.cleared", response_id: "greeting-1" });
  assert.equal(m.errors.length, 1);
  assert.equal(m.statuses.at(-1), "idle");
  assert.equal(m.peers[0].connectionState, "closed");
  assert.equal(channel.readyState, "closed");
  assert.ok(m.stream.tracks.every((track) => track.enabled === false && track.stopCount > 0));
  const sentCount = channel.sent.length;
  const statusCount = m.statuses.length;
  lateMessage?.({ data: JSON.stringify({ type: "output_audio_buffer.stopped", response_id: "greeting-1" }) });
  realtime.setMic(true);
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
  assert.equal(channel.sent.length, sentCount);
  assert.equal(m.statuses.length, statusCount);
  assert.equal(m.errors.length, 1);
});

test("첫 인사 응답이 실패하거나 중단되면 마이크를 열지 않고 연결을 정리한다", async (t) => {
  for (const status of ["failed", "cancelled", "incomplete"]) {
    await t.test(status, async (st) => {
      const m = setup(st);
      const realtime = await connectRealtime(m.handlers);
      st.after(() => realtime.close());
      beginGreeting(m.peers[0].channel);
      m.peers[0].channel.emit({
        type: "response.done",
        response: { id: "greeting-1", status, output: [], status_details: { error: { message: "mock internal detail" } } },
      });
      assert.ok(m.stream.tracks.every((track) => track.enabled === false && track.stopCount > 0));
      assert.equal(m.peers[0].connectionState, "closed");
      assert.equal(m.errors.length, 1);
      assert.ok(!m.errors[0].includes("mock internal detail"));
    });
  }
});

test("음성 재생이 거절되면 안전한 오류를 알리고 마이크를 켜지 않는다", async (t) => {
  const m = setup(t, { playError: new DOMException("mock autoplay denied", "NotAllowedError") });
  const realtime = await connectRealtime(m.handlers);
  t.after(() => realtime.close());
  beginGreeting(m.peers[0].channel);
  m.peers[0].ontrack?.({ streams: [m.stream] });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(m.audios[0].playCount > 0);
  assert.ok(m.stream.tracks.every((track) => track.enabled === false && track.stopCount > 0));
  assert.equal(m.peers[0].connectionState, "closed");
  assert.equal(m.audios[0].srcObject, null);
  assert.equal(m.errors.length, 1);
  assert.ok(!m.errors[0].includes("mock autoplay denied"));
});

test("마이크 권한이 없으면 수신 전용 연결을 유지하고 마이크를 켰다고 표시하지 않는다", async (t) => {
  const m = setup(t, { media: async () => { throw new DOMException("mock denied", "NotAllowedError"); } });
  const realtime = await connectRealtime(m.handlers);
  t.after(() => realtime.close());
  assert.equal(realtime.hasMic, false);
  assert.deepEqual(m.peers[0].transceivers, [{ kind: "audio", options: { direction: "recvonly" } }]);
  beginGreeting(m.peers[0].channel);
  finishGreeting(m.peers[0].channel);
  realtime.setMic(true);
  assert.notEqual(m.statuses.at(-1), "listening");
});

test("소리 설정은 출력에만 적용하고 종료는 트랙·채널·재생 자원을 정리한다", async (t) => {
  const m = setup(t);
  const realtime = await connectRealtime(m.handlers);
  const peer = m.peers[0];
  beginGreeting(peer.channel);
  const lateMessage = peer.channel.onmessage;
  const lateTrack = peer.ontrack;
  peer.ontrack?.({ streams: [m.stream] });
  realtime.setSound(false);
  assert.equal(m.audios[0].muted, true);
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
  realtime.setSound(true);
  assert.equal(m.audios[0].muted, false);
  realtime.close();
  realtime.close();
  assert.ok(m.stream.tracks.every((track) => track.stopCount > 0));
  assert.equal(peer.connectionState, "closed");
  assert.equal(peer.channel.readyState, "closed");
  assert.equal(m.audios[0].srcObject, null);
  assert.ok(m.audios[0].pauseCount > 0);
  const statusCount = m.statuses.length;
  lateMessage?.({ data: JSON.stringify({ type: "output_audio_buffer.stopped", response_id: "greeting-1" }) });
  lateTrack?.({ streams: [m.stream] });
  realtime.setMic(true);
  assert.equal(m.statuses.length, statusCount);
  assert.ok(m.stream.tracks.every((track) => track.enabled === false));
  assert.equal(m.audios[0].srcObject, null);
});

test("연결 준비 중 실패해도 이미 얻은 마이크와 출력 자원을 해제한다", async (t) => {
  for (const failure of ["offer", "local-description", "remote-description", "answer-http", "answer-network"] as const) {
    await t.test(failure, async (st) => {
      const m = setup(st, { failure });
      await assert.rejects(connectRealtime(m.handlers));
      assert.ok(m.stream.tracks.every((track) => track.stopCount > 0));
      assert.equal(m.peers[0].connectionState, "closed");
      assert.equal(m.peers[0].channel.readyState, "closed");
      assert.equal(m.audios[0].srcObject, null);
      assert.ok(m.audios[0].pauseCount > 0);
    });
  }
});

test("임시 세션 요청 실패는 마이크 권한을 요청하지 않는다", async (t) => {
  const m = setup(t, { sessionStatus: 503 });
  await assert.rejects(connectRealtime(m.handlers));
  assert.equal(m.mediaRequests.length, 0);
  assert.equal(m.requests.length, 1);
});

test("이미 취소된 연결은 네트워크나 마이크 요청을 시작하지 않는다", async (t) => {
  const m = setup(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(connectRealtime(m.handlers, {}, controller.signal), { name: "AbortError" });
  assert.equal(m.requests.length, 0);
  assert.equal(m.mediaRequests.length, 0);
});

test("마이크 권한 응답을 기다리다 취소하면 늦게 도착한 트랙도 정리한다", async (t) => {
  const permission = deferred<MockStream>();
  const m = setup(t, { media: () => permission.promise });
  const controller = new AbortController();
  const pending = connectRealtime(m.handlers, {}, controller.signal);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await m.mediaRequested.promise;
  controller.abort();
  permission.resolve(m.stream);
  await rejected;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(m.stream.tracks.every((track) => track.stopCount > 0));
  assert.ok(m.peers.every((peer) => peer.connectionState === "closed"));
  assert.ok(m.audios.every((audio) => audio.srcObject === null));
  assert.equal(m.requests.length, 1, "취소 후 SDP 요청을 시작하지 않는다");
});

test("연결 완료 후에도 취소 신호가 마이크와 피어를 닫는다", async (t) => {
  const m = setup(t);
  const controller = new AbortController();
  const realtime = await connectRealtime(m.handlers, {}, controller.signal);
  beginGreeting(m.peers[0].channel);
  finishGreeting(m.peers[0].channel);
  assert.ok(m.stream.tracks.every((track) => track.enabled));
  controller.abort();
  assert.ok(m.stream.tracks.every((track) => track.stopCount > 0));
  assert.ok(m.stream.tracks.every((track) => !track.enabled));
  assert.equal(m.peers[0].connectionState, "closed");
  assert.equal(m.peers[0].channel.readyState, "closed");
  assert.equal(m.audios[0].srcObject, null);
  realtime.close();
});

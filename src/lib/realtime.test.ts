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
  memory?: boolean;
  webSearch?: boolean;
  searchRequest?: () => Promise<Response>;
  memoryRequest?: (body: Record<string, unknown>) => Promise<Response>;
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
      return Response.json({ key: "mock-ephemeral-key", memory: options.memory ?? false, webSearch: options.webSearch ?? false }, { status: options.sessionStatus ?? 200 });
    }
    if (input === "/api/web-search") return options.searchRequest?.() ?? Response.json({ available: true, text: "공식 안내", sources: [{ title: "공식 문서", url: "https://example.com/docs" }] });
    if (input === "/api/voice-memory") {
      const body = JSON.parse(String(init?.body));
      return options.memoryRequest?.(body) ?? (body.action === "remember" ? Response.json({ accepted: true }, { status: 202 }) : Response.json({ context: "사용자는 아줄을 좋아한다고 말했다." }));
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

test("음성 웹검색은 인증된 서버 도구를 한 번 실행하고 전사에 출처를 붙인다", async t => {
  const m = setup(t, { webSearch: true });
  const rt = await connectRealtime(m.handlers, {}, undefined, "fake-token", { greeting: false });
  t.after(() => rt.close());
  const c = m.peers[0].channel; c.open();
  c.emit({ type: "response.created", response: { id: "search-response" } });
  const call = { type: "function_call", name: "search_web", call_id: "search1", arguments: '{"query":"공식 문서"}' };
  c.emit({ ...call, type: "response.function_call_arguments.done" });
  c.emit({ type: "response.done", response: { id: "search-response", status: "completed", output: [call] } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(m.requests.filter(r => r.input === "/api/web-search").length, 1);
  const req = m.requests.find(r => r.input === "/api/web-search")!;
  assert.equal(new Headers(req.init?.headers).get("authorization"), "Bearer fake-token");
  assert.deepEqual(JSON.parse(String(req.init?.body)), { query: "공식 문서" });
  assert.ok(c.sent.some(e => e.type === "response.create"));
  c.emit({ type: "response.created", response: { id: "answer-search" } });
  c.emit({ type: "response.output_audio_transcript.done", response_id: "answer-search", transcript: "공식 안내에 따르면 가능해." });
  assert.match(m.assistantTexts.at(-1)!, /https:\/\/example.com\/docs/);
});

test("늦게 끝난 웹검색은 새 발언을 가로채거나 출처를 섞지 않는다", async t => {
  const deferredSearch = deferred<Response>();
  const m = setup(t, { webSearch: true, searchRequest: () => deferredSearch.promise });
  const rt = await connectRealtime(m.handlers, {}, undefined, "fake-token", { greeting: false });
  t.after(() => rt.close());
  const c = m.peers[0].channel; c.open();
  c.emit({ type: "response.created", response: { id: "old" } });
  c.emit({ type: "response.done", response: { id: "old", status: "completed", output: [{ type: "function_call", name: "search_web", call_id: "late-search", arguments: '{"query":"공식 문서"}' }] } });
  c.emit({ type: "input_audio_buffer.speech_started" });
  deferredSearch.resolve(Response.json({ available: true, text: "old", sources: [{ title: "old", url: "https://example.com/old" }] }));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(c.sent.filter(e => e.type === "response.create").length, 0);
  c.emit({ type: "response.output_audio_transcript.done", transcript: "새 답변" });
  assert.equal(m.assistantTexts.at(-1), "새 답변");
});

test("음성 검색은 발언당 두 번으로 제한하고 인증 거절 때 통화를 종료한다", async t => {
  const m = setup(t, { webSearch: true });
  const rt = await connectRealtime(m.handlers, {}, undefined, "fake-token", { greeting: false });
  t.after(() => rt.close());
  const c = m.peers[0].channel; c.open();
  for (let n = 0; n < 3; n++) c.emit({ type: "response.function_call_arguments.done", name: "search_web", call_id: `cap-${n}`, arguments: '{"query":"공식 문서"}' });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(m.requests.filter(r => r.input === "/api/web-search").length, 2);
  rt.close();
  const denied = setup(t, { webSearch: true, searchRequest: async () => Response.json({}, { status: 403 }) });
  const deniedRt = await connectRealtime(denied.handlers, {}, undefined, "fake-token", { greeting: false });
  t.after(() => deniedRt.close());
  const dc = denied.peers[0].channel; dc.open();
  dc.emit({ type: "response.function_call_arguments.done", name: "search_web", call_id: "denied", arguments: '{"query":"공식 문서"}' });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(dc.closeCount, 1);
  assert.match(denied.errors[0], /회원·이용 동의/);
});

function finishGreeting(channel: MockChannel) {
  channel.emit({ type: "output_audio_buffer.started", response_id: "greeting-1" });
  channel.emit({ type: "response.done", response: { id: "greeting-1", status: "completed", output: [{ type: "message" }] } });
  channel.emit({ type: "output_audio_buffer.stopped", response_id: "greeting-1" });
}

test("마이크 연결·재연결은 인사 없이 VAD를 켜고 바로 듣는다", async t => {
  const m = setup(t);
  for (let i = 0; i < 2; i++) {
    const rt = await connectRealtime(m.handlers, {}, undefined, undefined, { greeting: false });
    const c = m.peers[i].channel;
    assert.ok(m.peers[i].addedTracks.every(track => !track.enabledAtAdd));
    c.open(); c.open();
    assert.equal(c.sent.filter(event => event.type === "response.create").length, 0);
    assert.equal(c.sent.filter(event => event.type === "session.update").length, 1);
    assert.equal(m.statuses.at(-1), "listening");
    assert.ok(m.stream.tracks.every(track => track.enabled));
    rt.close();
  }
});

test("홈 문구가 없거나 유효하지 않으면 음성 인사나 빈 맥락을 생성하지 않는다", async t => {
  for (const opener of [undefined, "", "   ", "<script>"]) {
    await t.test(String(opener), async st => {
      const m = setup(st);
      const rt = await connectRealtime(m.handlers, {}, undefined, "fake-token", { opener });
      st.after(() => rt.close());
      const channel = m.peers[0].channel;
      channel.open();
      assert.equal(channel.sent.filter(e => e.type === "response.create" || e.type === "conversation.item.create").length, 0);
      assert.equal(m.statuses.at(-1), "listening");
      assert.ok(m.stream.tracks.every(track => track.enabled));
    });
  }
});

test("홈 인사는 마이크 요청 없이 재생하고 완료되면 연결을 닫는다", async t => {
  const m = setup(t);
  let completed = 0;
  const rt = await connectRealtime(m.handlers, {}, undefined, undefined, { microphone: false, opener: "그 파스타, 만들어 봤어?", onGreetingEnd: () => completed++ });
  t.after(() => rt.close());
  const peer = m.peers[0];
  peer.channel.open();
  assert.equal(peer.channel.sent.length, 0, "재생 허용 전에 인사를 생성하지 않는다");
  assert.equal(m.mediaRequests.length, 0);
  assert.equal(rt.hasMic, false);
  assert.deepEqual(peer.transceivers, [{ kind: "audio", options: { direction: "recvonly" } }]);
  peer.ontrack?.({ streams: [m.stream] });
  await new Promise<void>(resolve => setImmediate(resolve));
  beginGreeting(peer.channel);
  finishGreeting(peer.channel);
  assert.equal(completed, 1);
  assert.equal(peer.connectionState, "closed");
  assert.equal(peer.channel.sent.filter(event => event.type === "response.create").length, 1);
});

test("홈 자동재생이 막히면 첫 제스처에서만 재시도하고 종료 시 리스너를 제거한다", async t => {
  const listeners = new Map<string, () => void>();
  replaceGlobal(t, "document", {
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
  });
  const m = setup(t, { playError: new DOMException("blocked", "NotAllowedError") });
  const rt = await connectRealtime(m.handlers, {}, undefined, undefined, { microphone: false, opener: "그 파스타, 만들어 봤어?" });
  t.after(() => rt.close());
  const peer = m.peers[0];
  peer.channel.open(); peer.ontrack?.({ streams: [m.stream] });
  await new Promise<void>(r => setImmediate(r));
  assert.equal(m.errors.length, 0);
  assert.equal(peer.channel.sent.length, 0);
  assert.equal(m.mediaRequests.length, 0);
  assert.equal(listeners.size, 2);
  m.audios[0].playError = null;
  listeners.get("pointerdown")!();
  await new Promise<void>(r => setImmediate(r));
  assert.equal(listeners.size, 0);
  assert.equal(peer.channel.sent.filter(e => e.type === "response.create").length, 1);
  rt.close();
  assert.equal(peer.connectionState, "closed");
});

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
  const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
  t.after(() => realtime.close());
  const channel = m.peers[0].channel;
  const greeting = beginGreeting(channel);
  channel.open();

  assert.equal(channel.sent.filter((event) => event.type === "response.create").length, 1);
  assert.deepEqual(greeting.response?.output_modalities, ["audio"]);
  assert.equal(greeting.response?.tool_choice, "none");
  assert.ok(greeting.response?.instructions?.trim());
  assert.ok(Object.keys(greeting.response?.metadata ?? {}).length > 0);
  assert.equal(m.statuses.at(-1), "connecting");
});

test("마이크 진입은 홈 문구를 맥락으로만 전달하고 다시 인사하지 않는다", async (t) => {
  const m = setup(t);
  const realtime = await connectRealtime(m.handlers, {}, undefined, "fake-token", { greeting: false, opener: "요즘 아줄 어때?" });
  t.after(() => realtime.close());
  const channel = m.peers[0].channel;
  channel.open();
  channel.open();
  assert.equal(channel.sent.filter(event => event.type === "response.create").length, 0);
  const context = channel.sent.filter(event => event.type === "conversation.item.create");
  assert.equal(context.length, 1);
  assert.match(JSON.stringify(context[0]), /요즘 아줄 어때/);
});

test("인사 생성 완료나 다른 응답의 재생 완료로는 마이크 잠금을 풀지 않는다", async (t) => {
  const m = setup(t);
  const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
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
  const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
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
  const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
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
  const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
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
      const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
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
  const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
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
  const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
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
  const realtime = await connectRealtime(m.handlers, {}, undefined, undefined, { opener: "그 파스타, 만들어 봤어?" });
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
  const realtime = await connectRealtime(m.handlers, {}, controller.signal, undefined, { opener: "그 파스타, 만들어 봤어?" });
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

test("음성 기억은 확정된 사용자 발언만 한 번 저장하고 부분 인식·AI 인사는 제외한다", async t => {
  const m = setup(t, { memory: true });
  const rt = await connectRealtime(m.handlers, {}, undefined, "test-member-token", { opener: "그 파스타, 만들어 봤어?" });
  t.after(() => rt.close());
  const c = m.peers[0].channel;
  beginGreeting(c);
  c.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "early", transcript: "인사 중" });
  c.emit({ type: "response.output_audio_transcript.done", transcript: "안녕" });
  finishGreeting(c);
  c.emit({ type: "conversation.item.input_audio_transcription.delta", item_id: "user-1", delta: "나는" });
  const event = { type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript: "나는 아줄을 좋아해" };
  c.emit(event); c.emit(event);
  await new Promise<void>(r => setImmediate(r));
  const saves = m.requests.filter(r => r.input === "/api/voice-memory");
  assert.equal(saves.length, 1);
  assert.deepEqual(m.userTexts, ["나는 아줄을 좋아해"]);
  const body = JSON.parse(String(saves[0].init?.body));
  assert.equal(body.text, "나는 아줄을 좋아해");
  assert.equal(body.action, "remember");
  assert.match(body.sourceId, /^[\w-]+:user-1$/);
  assert.equal(saves[0].init?.keepalive, true);
  assert.equal(new Headers(saves[0].init?.headers).get("authorization"), "Bearer test-member-token");
});

test("기억 도구 결과를 돌려준 다음에만 후속 음성 응답을 요청하며 중복 이벤트는 무시한다", async t => {
  const pending = deferred<Response>();
  const m = setup(t, { memory: true, memoryRequest: () => pending.promise });
  const rt = await connectRealtime(m.handlers, {}, undefined, "test-member-token", { opener: "그 파스타, 만들어 봤어?" });
  t.after(() => rt.close());
  const c = m.peers[0].channel;
  beginGreeting(c); finishGreeting(c);
  c.emit({ type: "response.created", response: { id: "r1" } });
  const call = { type: "function_call", name: "recall_memories", call_id: "call1", arguments: JSON.stringify({ query: "좋아하는 보드게임" }) };
  c.emit({ ...call, type: "response.function_call_arguments.done" });
  c.emit({ ...call, type: "response.function_call_arguments.done" });
  const done = { type: "response.done", response: { id: "r1", status: "completed", output: [call] } };
  c.emit(done);
  assert.equal(c.sent.filter(e => e.type === "response.create").length, 1);
  pending.resolve(Response.json({ context: "사용자는 아줄을 좋아한다고 말했다." }));
  await new Promise<void>(r => setImmediate(r));
  c.emit(done);
  assert.equal(m.requests.filter(r => r.input === "/api/voice-memory").length, 1);
  const outputIndex = c.sent.findIndex(e => e.type === "conversation.item.create");
  assert.match(JSON.stringify(c.sent[outputIndex]), /아줄/);
  assert.equal(c.sent[outputIndex + 1].type, "response.create");
  assert.equal(c.sent.filter(e => e.type === "response.create").length, 2);
});

test("음성 저장 요청 실패는 통화를 끊거나 연결 오류로 표시하지 않는다", async t => {
  const m = setup(t, { memory: true, memoryRequest: async () => new Response(null, { status: 503 }) });
  const warnings: string[] = [];
  const rt = await connectRealtime({ ...m.handlers, onMemoryWarning: text => warnings.push(text) }, {}, undefined, "test-member-token", { opener: "그 파스타, 만들어 봤어?" });
  t.after(() => rt.close());
  const c = m.peers[0].channel;
  beginGreeting(c); finishGreeting(c);
  c.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript: "차를 좋아해" });
  await new Promise<void>(r => setImmediate(r));
  assert.equal(warnings.length, 1);
  assert.equal(m.errors.length, 0);
  assert.notEqual(m.peers[0].connectionState, "closed");
  assert.equal(m.statuses.at(-1), "listening");
});

test("기억 검색 중 새 발언·종료가 오면 늦은 결과로 음성을 재시작하지 않는다", async t => {
  for (const action of ["interrupt", "close"]) await t.test(action, async st => {
    const pending = deferred<Response>();
    const m = setup(st, { memory: true, memoryRequest: () => pending.promise });
    const rt = await connectRealtime(m.handlers, {}, undefined, "test-member-token", { opener: "그 파스타, 만들어 봤어?" });
    st.after(() => rt.close());
    const c = m.peers[0].channel;
    beginGreeting(c); finishGreeting(c);
    c.emit({ type: "response.created", response: { id: "r1" } });
    c.emit({ type: "response.done", response: { id: "r1", status: "completed", output: [{ type: "function_call", name: "recall_memories", call_id: "call1", arguments: '{"query":"취향"}' }] } });
    if (action === "close") rt.close(); else c.emit({ type: "input_audio_buffer.speech_started", item_id: "new-turn" });
    pending.resolve(Response.json({ context: "늦게 온 기억" }));
    await new Promise<void>(r => setImmediate(r));
    assert.equal(c.sent.filter(e => e.type === "response.create").length, 1);
  });
});

test("검색 장애는 기억 없이 대화를 이어가되 동의 거부는 통화를 정리한다", async t => {
  for (const status of [503, 403, 401]) await t.test(String(status), async st => {
    const m = setup(st, { memory: true, memoryRequest: async () => Response.json({ error: "private" }, { status }) });
    const rt = await connectRealtime(m.handlers, {}, undefined, "test-member-token", { opener: "그 파스타, 만들어 봤어?" });
    st.after(() => rt.close());
    const c = m.peers[0].channel;
    beginGreeting(c); finishGreeting(c);
    c.emit({ type: "response.done", response: { id: "r1", status: "completed", output: [{ type: "function_call", name: "recall_memories", call_id: "call1", arguments: '{"query":"취향"}' }] } });
    await new Promise<void>(r => setImmediate(r));
    if (status === 503) {
      assert.equal(c.readyState, "open");
      assert.equal(c.sent.filter(e => e.type === "response.create").length, 2);
      assert.match(JSON.stringify(c.sent), /available\\\":false/);
    } else {
      assert.equal(c.readyState, "closed");
      assert.ok(m.errors[0].includes("동의"));
    }
    assert.ok(!m.errors.join().includes("private"));
  });
});

test("운영처럼 기억이 비활성이면 음성 발언을 기억 API에 보내지 않는다", async t => {
  const m = setup(t);
  const rt = await connectRealtime(m.handlers, {}, undefined, "test-member-token", { opener: "그 파스타, 만들어 봤어?" });
  t.after(() => rt.close());
  const c = m.peers[0].channel;
  beginGreeting(c); finishGreeting(c);
  c.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript: "차를 좋아해" });
  assert.equal(m.requests.filter(r => r.input === "/api/voice-memory").length, 0);
});

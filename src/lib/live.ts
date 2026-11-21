import type { Handlers, Realtime } from "./realtime.ts";
import type { StyleId } from "./onboarding.ts";
import { createOutputAudioMeter } from "./output-audio-meter.ts";
import { microphoneErrorMessage } from "./microphone-permission.ts";
import { liveConversation, type LiveDelegateReply } from "./live-conversation.ts";
import { requestVoiceMemory, VoiceMemoryAccessError } from "./voice-memory-client.ts";
import { liveContextChunks } from "./live-context.ts";
import { voiceTiming } from "./voice-timing.ts";

const CONNECTION_ERROR = "음성 대화를 연결하지 못했어요. 잠시 후 다시 눌러 주세요.";

export async function connectLive(
  h: Handlers,
  persona: { name?: string; voice?: string; nickname?: string; style?: StyleId } = {},
  signal?: AbortSignal,
  accessToken?: string,
  options: { microphone?: boolean;
    historyManaged?: boolean; inputStream?: MediaStream; onDiagnostic?: (event: string) => void } = {},
): Promise<Realtime> {
  const controller = new AbortController();
  const timing = voiceTiming();
  const peer = new RTCPeerConnection();
  const channel = peer.createDataChannel("live-events");
  const audio = new Audio();
  audio.autoplay = false;
  let mic: MediaStream | undefined;
  let microphoneError: string | undefined;
  let started = false, closed = false, closing = false, memory = false;
  let requestedMic = options.microphone !== false;
  let status: Parameters<Handlers["onStatus"]>[0] = "connecting";
  let lastSpeechAt = 0;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let resumePlayback: (() => void) | undefined;
  let silenceContext: AudioContext | undefined;
  let silenceSource: ConstantSourceNode | undefined;
  let readyResolve!: () => void, readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  // Setup can fail before awaiting readiness. Attach a handler immediately.
  void ready.catch(() => {});
  const updateStatus = (next: typeof status) => {
    if (status === next || closed || closing) return;
    status = next; h.onStatus(next);
  };
  function send(event: object) {
    if (!started || closed || closing || channel.readyState !== "open") return;
    const command = event as { type: string; content?: string };
    const contents = typeof command.content === "string" ? liveContextChunks(command.content) : [undefined];
    for (const content of contents) channel.send(JSON.stringify({ ...event, ...(content !== undefined ? { content } : {}), event_id: crypto.randomUUID() }));
  }
  const conversation = liveConversation({
    prepareContext: async (messages, workSignal) => {
      if (!memory || !accessToken) return null;
      const response = await fetch('/api/live/context', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ messages }), signal: AbortSignal.any([workSignal, controller.signal, AbortSignal.timeout(6000)]),
      });
      if (response.status === 401 || response.status === 403) fail('회원·이용 동의를 다시 확인하려면 새로고침해 주세요.');
      if (!response.ok) return null;
      const { context } = await response.json();
      return { ...context, recent_messages: messages, app_signals: { conversation_mode: 'voice' } };
    },
    partial: (role, text) => {
      if (closing || closed) return;
      if (role === "user") h.onUserPartial(text);
      else h.onAssistantPartial(text);
    },
    complete: (role, text) => {
      if (role === "user") h.onUserText(text); else h.onAssistantText(text);
    },
    remember: (text, sourceId) => {
      if (options.historyManaged || !memory || !accessToken || options.microphone === false) return;
      // Keepalive, no call-abort signal: closing voice must not cancel the last save.
      void requestVoiceMemory({ action: "remember", text, sourceId }, accessToken).then(() => {
        options.onDiagnostic?.("memory.accepted");
      }).catch(error => {
        options.onDiagnostic?.("memory.failed");
        if (closed || closing) return;
        if (error instanceof VoiceMemoryAccessError) fail("회원·이용 동의를 다시 확인하려면 새로고침해 주세요.");
        else h.onMemoryWarning?.("이번 발언의 기억 저장을 요청하지 못했어요. 음성 대화는 계속할 수 있어요.");
      });
    },
    delegate: async (messages, workSignal) => {
      const response = await fetch("/api/live/delegate", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ messages, name: persona.name, nickname: persona.nickname, style: persona.style }),
        signal: AbortSignal.any([workSignal, controller.signal, AbortSignal.timeout(110_000)]),
      });
      if (response.status === 401 || response.status === 403) fail("회원·이용 동의를 다시 확인하려면 새로고침해 주세요.");
      if (!response.ok) throw new Error("delegation_failed");
      const reply = await response.json() as LiveDelegateReply;
      if (typeof reply.reply !== "string" || !reply.reply.trim() || reply.reply.length > 12_000) throw new Error("invalid_delegation");
      options.onDiagnostic?.(`delegation.completed:sources=${reply.sources?.length ?? 0}`);
      return reply;
    },
    result: reply => {
      if (reply.crisis) h.onTool("show_crisis_help");
      if (reply.suggest) h.onTool("show_get_help");
      if (Array.isArray(reply.sources)) h.onSearchSources?.(reply.sources);
    }, send,
  }, crypto.randomUUID());

  // Live has no output-audio-done event. Drive both lip sync and speaking state
  // from actual playback energy; a transcript acknowledgment is not playback.
  const meter = createOutputAudioMeter((level, shape) => {
    if (closed || closing) return;
    h.onOutputLevel?.(level, shape);
    if (level > .035) {
      lastSpeechAt = performance.now();
      timing("first_audio"); updateStatus("speaking");
    }
  });
  meter.setEnabled(true);
  const monitor = setInterval(() => {
    if (closed || closing || !started) return;
    if (status === "speaking" && performance.now() - lastSpeechAt > 1400) {
      updateStatus(requestedMic && mic ? "listening" : "idle");
    }
  }, 150);

  function cleanup() {
    if (closed) return;
    conversation.close();
    closed = true;
    controller.abort();
    clearInterval(monitor); clearTimeout(closeTimer); clearTimeout(startTimer);
    signal?.removeEventListener("abort", close);
    if (resumePlayback) {
      document.removeEventListener("pointerdown", resumePlayback);
      document.removeEventListener("keydown", resumePlayback);
    }
    meter.close();
    channel.onmessage = channel.onerror = channel.onclose = null;
    peer.ontrack = peer.onconnectionstatechange = null;
    mic?.getTracks().forEach(track => track.stop());
    silenceSource?.stop();
    if (silenceContext) void silenceContext.close().catch(() => {});
    audio.pause(); audio.srcObject = null;
    channel.close(); peer.close();
    readyReject(new Error(CONNECTION_ERROR));
  }
  function close() {
    if (closed || closing) return;
    conversation.stopWork();
    // Stop transmitting/playing immediately; retain transport for final events.
    mic?.getTracks().forEach(track => { track.enabled = false; });
    audio.muted = true;
    if (started && channel.readyState === "open") {
      send({ type: "session.close" });
      closing = true;
      closeTimer = setTimeout(cleanup, 15_000);
    } else cleanup();
  }
  function fail(message: string) {
    if (closed || closing) return;
    h.onStatus("idle"); h.onError(message);
    readyReject(new Error(message)); close();
  }
  function applyMic() {
    mic?.getTracks().forEach(track => { track.enabled = started && requestedMic && !closed && !closing; });
    if (started) send({ type: requestedMic ? "session.input_audio.unmute" : "session.input_audio.mute" });
  }
  signal?.addEventListener("abort", close, { once: true });
  channel.onmessage = message => {
    if (closed) return;
    let event: Record<string, unknown>;
    try { event = JSON.parse(message.data); } catch { return; }
    if (!event || typeof event !== "object") return;
    if (event.type === "session.delegation.created" || event.type === "session.started" || event.type === "session.closed") options.onDiagnostic?.(event.type);
    if (event.type === "session.started" && !started) {
      started = true; clearTimeout(startTimer); timing("channel_ready");
      applyMic(); updateStatus(mic && requestedMic ? "listening" : "idle");
      readyResolve();
    } else if (event.type === "session.closed") {
      if (!closing) { h.onStatus("idle"); h.onError("음성 대화가 종료됐어요. 마이크를 눌러 다시 이어갈 수 있어요."); }
      cleanup();
    } else if (event.type === "error") {
      fail("음성 요청을 처리하지 못했어요. 마이크를 다시 눌러 주세요.");
    }
    else conversation.accept(event);
  };
  channel.onerror = () => fail(CONNECTION_ERROR);
  channel.onclose = () => { if (!closed) { if (!closing) fail(CONNECTION_ERROR); cleanup(); } };
  peer.onconnectionstatechange = () => { if (peer.connectionState === "failed") { fail(CONNECTION_ERROR); cleanup(); } };
  peer.ontrack = event => {
    if (closed || closing) return;
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    audio.srcObject = stream; meter.attach(stream, audio);
    const play = () => {
      if (closed || closing) return;
      void audio.play().then(() => {
        if (closed || closing) return;
        document.removeEventListener("pointerdown", play); document.removeEventListener("keydown", play);
        resumePlayback = undefined;
      }).catch(error => {
        if (closed || closing) return;
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          if (!resumePlayback) {
            resumePlayback = play;
            document.addEventListener("pointerdown", play); document.addEventListener("keydown", play);
          }
        } else fail("소리를 재생할 수 없어요. 마이크를 다시 눌러 주세요.");
      });
    };
    play();
  };
  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    h.onStatus("connecting");
    if (options.microphone !== false) {
      try {
        mic = options.inputStream ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (closed || closing) { mic.getTracks().forEach(t => t.stop()); throw new DOMException("Aborted", "AbortError"); }
        mic.getTracks().forEach(track => { track.enabled = false; peer.addTrack(track, mic!); });
      } catch (error) {
        if (closed || closing) throw error;
        microphoneError = microphoneErrorMessage(error);
        peer.addTransceiver("audio", { direction: "recvonly" });
      }
    } else {
      // A receive-only session still needs an advancing input timeline.
      // A generated silent track is not microphone access or recorded user audio.
      silenceContext = new AudioContext();
      const destination = silenceContext.createMediaStreamDestination();
      silenceSource = silenceContext.createConstantSource();
      silenceSource.offset.value = 0; silenceSource.connect(destination); silenceSource.start();
      peer.addTrack(destination.stream.getAudioTracks()[0], destination.stream);
      void silenceContext.resume().catch(() => {});
    }
    controller.signal.throwIfAborted(); timing("media_ready");
    await peer.setLocalDescription(await peer.createOffer());
    await waitForIce(peer, controller.signal);
    const response = await fetch("/api/live", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ sdp: peer.localDescription?.sdp }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
    });
    if (!response.ok) throw new Error(CONNECTION_ERROR);
    const result = await response.json();
    if (typeof result.sdp !== "string" || !result.sdp.startsWith("v=0")) throw new Error(CONNECTION_ERROR);
    memory = result.memory === true && Boolean(accessToken);
    controller.signal.throwIfAborted(); timing("session_key");
    startTimer = setTimeout(() => fail(CONNECTION_ERROR), 20_000);
    await peer.setRemoteDescription({ type: "answer", sdp: result.sdp });
    await ready;
    return {
      hasMic: Boolean(mic), microphoneError,
      // Text conversations use /api/chat. Live accepts context, not Realtime conversation.item.create.
      sendText(text) { send({ type: "session.thinking.append", delegation_id: null, content: JSON.stringify({ role: "user", content: text.slice(0, 8000) }) }); },
      setMic(on) { requestedMic = on; applyMic(); if (status !== "speaking") updateStatus(on && mic ? "listening" : "idle"); },
      setSound(on) { audio.muted = !on; if (!on) h.onOutputLevel?.(0, "rest"); }, close,
    };
  } catch (error) { cleanup(); throw error; }
}

function waitForIce(peer: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", check); signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    const check = () => { if (peer.iceGatheringState === "complete") finish(); };
    const abort = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new Error(CONNECTION_ERROR)), 10_000);
    peer.addEventListener("icegatheringstatechange", check); signal.addEventListener("abort", abort, { once: true });
  });
}

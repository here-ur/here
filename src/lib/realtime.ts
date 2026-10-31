import { cleanName, DEFAULT_COMPANION, josa } from "./onboarding.ts";
import { requestVoiceMemory, VoiceMemoryAccessError } from "./voice-memory-client.ts";

// 브라우저 ↔ OpenAI realtime (WebRTC). 진짜 키는 서버에만 있고, 여기서는 /api/realtime이 준 임시 키만 쓴다.
export type Handlers = {
  onStatus: (s: "connecting" | "listening" | "thinking" | "speaking" | "idle") => void;
  onUserText: (text: string) => void;
  onUserPartial: (text: string) => void;
  onAssistantPartial: (text: string) => void;
  onAssistantText: (text: string) => void;
  onTool: (name: "show_crisis_help" | "show_get_help") => void;
  onError: (message: string) => void;
  onMemoryWarning?: (message: string) => void;
};

export type Realtime = {
  sendText: (text: string) => void;
  // 인사 중에는 켜기 요청만 기억하고, 실제 입력은 인사 재생이 끝난 뒤 연다.
  setMic: (on: boolean) => void;
  setSound: (on: boolean) => void;
  close: () => void;
  hasMic: boolean;
};

const CONNECTION_ERROR = "몽글이와 연결하지 못했어요. 조금 뒤에 다시 해 줘.";
const GREETING_ERROR = "첫 인사를 들려주지 못했어요. 음성 버튼을 다시 눌러 주세요.";

export async function connectRealtime(
  h: Handlers,
  persona: { name?: string; voice?: string } = {},
  signal?: AbortSignal,
  accessToken?: string,
): Promise<Realtime> {
  const controller = new AbortController();
  let pc: RTCPeerConnection | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let mic: MediaStream | null = null;
  let dc: RTCDataChannel | null = null;
  let closed = false;
  let greetingPending = true;
  let greetingRequested = false;
  let greetingResponseId: string | null = null;
  let greetingTimer: ReturnType<typeof setTimeout> | undefined;
  let micRequested = true;
  let playing = false;
  let currentStatus: Parameters<Handlers["onStatus"]>[0] = "connecting";
  let assistant = "";
  const userParts = new Map<string, string>();
  let memoryEnabled = false;
  const memorySessionId = crypto.randomUUID();
  const transcripts = new Set<string>();
  const toolResults = new Map<string, Promise<void>>();
  const handledResponses = new Set<string>();
  const responseTurns = new Map<string, number>();
  let turn = 0;
  let toolRounds = 0;

  function boundedAdd(set: Set<string>, key: string) {
    set.add(key);
    if (set.size > 256) set.delete(set.values().next().value!);
  }

  function memoryError(error: unknown, saving: boolean) {
    if (closed) return;
    if (error instanceof VoiceMemoryAccessError) fail("회원·이용 동의를 다시 확인하려면 새로고침해 주세요.");
    else if (saving) h.onMemoryWarning?.("이번 발언의 기억 저장을 요청하지 못했어요. 음성 대화는 계속할 수 있어요.");
  }

  function processTool(call: { name?: string; call_id?: string; arguments?: string }): Promise<void> {
    const id = call.call_id;
    if (!id || !/^[\w-]{1,200}$/.test(id)) return Promise.resolve();
    const existing = toolResults.get(id);
    if (existing) return existing;
    const task = (async () => {
      let output: object = { error: "unsupported_tool" };
      if (call.name === "show_crisis_help" || call.name === "show_get_help") {
        h.onTool(call.name);
        output = { shown: true };
      } else if (call.name === "recall_memories" && memoryEnabled && accessToken) {
        output = { context: "", available: false };
        try {
          const args = JSON.parse(call.arguments || "{}");
          if (typeof args.query === "string" && args.query.trim() && args.query.length <= 1000 && toolRounds < 4) {
            const context = await requestVoiceMemory({ action: "recall", text: args.query }, accessToken, controller.signal);
            output = { context, available: Boolean(context) };
          }
        } catch (error) { memoryError(error, false); }
      }
      if (!closed) send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: id, output: JSON.stringify(output) } });
    })();
    toolResults.set(id, task);
    if (toolResults.size > 256) toolResults.delete(toolResults.keys().next().value!);
    return task;
  }

  function updateStatus(status: Parameters<Handlers["onStatus"]>[0]) {
    currentStatus = status;
    h.onStatus(status);
  }

  function close(reason?: unknown) {
    if (closed) return;
    closed = true;
    controller.abort(reason);
    clearTimeout(greetingTimer);
    signal?.removeEventListener("abort", abort);
    if (dc) {
      dc.onopen = null;
      dc.onmessage = null;
      dc.onerror = null;
      dc.onclose = null;
      dc.close();
    }
    if (pc) {
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    mic?.getTracks().forEach((track) => { track.enabled = false; track.stop(); });
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
    }
    userParts.clear();
    transcripts.clear();
    toolResults.clear();
    handledResponses.clear();
    responseTurns.clear();
  }

  function abort() {
    close(signal?.reason);
  }

  function fail(message: string) {
    if (closed) return;
    close(new Error(message));
    updateStatus("idle");
    h.onError(message);
  }

  function send(event: object) {
    if (closed || dc?.readyState !== "open") return false;
    dc.send(JSON.stringify(event));
    return true;
  }

  function applyMic() {
    const enabled = !closed && !greetingPending && micRequested;
    mic?.getTracks().forEach((track) => { track.enabled = enabled; });
  }

  function readyStatus() {
    updateStatus(mic && micRequested ? "listening" : "idle");
  }

  function finishGreeting() {
    if (!greetingPending || closed) return;
    clearTimeout(greetingTimer);
    // WebRTC의 response.done은 재생 완료가 아니다. output_audio_buffer.stopped 뒤에만 입력을 연다.
    send({ type: "input_audio_buffer.clear" });
    send({
      type: "session.update",
      session: { type: "realtime", audio: { input: { turn_detection: { type: "semantic_vad", eagerness: "low" } } } },
    });
    greetingPending = false;
    applyMic();
    readyStatus();
  }

  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();

  try {
    controller.signal.throwIfAborted();
    updateStatus("connecting");
    const res = await fetch("/api/realtime", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(persona),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(CONNECTION_ERROR);
    const { key, memory } = await res.json();
    memoryEnabled = memory === true && Boolean(accessToken);
    controller.signal.throwIfAborted();
    if (typeof key !== "string" || !key) throw new Error(CONNECTION_ERROR);

    const peer = new RTCPeerConnection();
    pc = peer;
    const audio = new Audio();
    audioEl = audio;
    audio.autoplay = true;
    peer.ontrack = (event) => {
      if (closed) return;
      audio.srcObject = event.streams[0];
      void audio.play().catch(() => fail("소리를 재생할 수 없어요. 음성 버튼을 다시 눌러 주세요."));
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") fail(CONNECTION_ERROR);
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // 권한 창이 떠 있는 동안 종료했어도, 나중에 허용된 스트림을 남기지 않는다.
      if (controller.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        controller.signal.throwIfAborted();
      }
      mic = stream;
      applyMic(); // addTrack 전에 잠가 첫 인사 중 사용자 음성이 전송되지 않게 한다.
      peer.addTrack(stream.getTracks()[0], stream);
    } catch (error) {
      if (controller.signal.aborted) throw error;
      mic?.getTracks().forEach((track) => track.stop());
      mic = null;
      peer.addTransceiver("audio", { direction: "recvonly" });
    }

    const channel = peer.createDataChannel("oai-events");
    dc = channel;
    channel.onopen = () => {
      if (closed || greetingRequested) return;
      greetingRequested = true;
      // Keep the quiet preparation state until greeting audio actually starts.
      const name = cleanName(persona.name ?? DEFAULT_COMPANION);
      send({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions: `너는 "${name}"이라는 AI 이야기 친구야. 사용자가 먼저 말하기를 기다리지 말고 한국어로 먼저 인사해. 차분하고 따뜻한 반말로 "안녕, 나는 ${josa(name, "이야", "야")}. 오늘은 어떤 하루였어?"라고 짧게 한 번만 말해. 진단하거나 사용자의 감정을 추측하지 마.`,
          tool_choice: "none",
          metadata: { phase: "greeting" },
        },
      });
      greetingTimer = setTimeout(() => fail(GREETING_ERROR), 30_000);
    };
    channel.onerror = () => fail(CONNECTION_ERROR);
    channel.onclose = () => fail(CONNECTION_ERROR);
    channel.onmessage = (message) => {
      if (closed) return;
      let event;
      try { event = JSON.parse(message.data); } catch { fail(CONNECTION_ERROR); return; }
      if (!event || typeof event !== "object") { fail(CONNECTION_ERROR); return; }
      switch (event.type) {
        case "response.created":
          if (typeof event.response?.id === "string") {
            responseTurns.set(event.response.id, turn);
            if (responseTurns.size > 256) responseTurns.delete(responseTurns.keys().next().value!);
          }
          if (greetingPending && greetingRequested && !greetingResponseId) greetingResponseId = event.response?.id ?? null;
          return;
        case "input_audio_buffer.speech_started":
          if (!greetingPending) { turn++; toolRounds = 0; }
          if (!greetingPending && micRequested) updateStatus("listening");
          return;
        case "input_audio_buffer.speech_stopped":
          if (!greetingPending && micRequested) updateStatus("thinking");
          return;
        case "conversation.item.input_audio_transcription.delta": {
          if (greetingPending || typeof event.delta !== "string") return;
          const text = (userParts.get(event.item_id) ?? "") + event.delta;
          userParts.set(event.item_id, text);
          h.onUserPartial(text);
          return;
        }
        case "conversation.item.input_audio_transcription.completed": {
          userParts.delete(event.item_id);
          if (greetingPending || typeof event.transcript !== "string" || !event.transcript.trim()) return;
          const id = typeof event.item_id === "string" ? event.item_id : "";
          if (id && transcripts.has(id)) return;
          if (id) boundedAdd(transcripts, id);
          const text = event.transcript.trim();
          h.onUserText(text);
          if (memoryEnabled && accessToken) {
            if (!/^[\w-]{1,150}$/.test(id) || text.length > 8000) {
              memoryError(new Error("invalid_transcript"), true);
            } else {
              void requestVoiceMemory({ action: "remember", text, sourceId: `${memorySessionId}:${id}` }, accessToken)
                .catch(error => memoryError(error, true));
            }
          }
          return;
        }
        case "response.output_audio_transcript.delta":
          if (typeof event.delta !== "string") return;
          assistant += event.delta;
          h.onAssistantPartial(assistant);
          return;
        case "response.output_audio_transcript.done":
          assistant = "";
          if (typeof event.transcript === "string" && event.transcript.trim()) h.onAssistantText(event.transcript.trim());
          return;
        case "output_audio_buffer.started":
          playing = true;
          updateStatus("speaking");
          return;
        case "output_audio_buffer.stopped":
          if (greetingPending) {
            if (greetingRequested && greetingResponseId && event.response_id === greetingResponseId) {
              playing = false;
              finishGreeting();
            }
          } else {
            playing = false;
            readyStatus();
          }
          return;
        case "output_audio_buffer.cleared":
          playing = false;
          if (greetingPending) fail(GREETING_ERROR);
          else readyStatus();
          return;
        case "response.function_call_arguments.done":
          if (greetingPending) return;
          void processTool(event);
          return;
        case "response.done": {
          if (greetingPending) {
            if (event.response?.id === greetingResponseId && event.response?.status !== "completed") fail(GREETING_ERROR);
            return; // 오디오 버퍼가 빌 때까지 마이크와 사용자 발화 안내를 열지 않는다.
          }
          if (event.response?.status !== "completed") { if (!playing) readyStatus(); return; }
          const id = event.response?.id;
          if (typeof id !== "string" || handledResponses.has(id)) return;
          boundedAdd(handledResponses, id);
          const output: { type: string; name?: string; call_id?: string; arguments?: string }[] = Array.isArray(event.response?.output) ? event.response.output : [];
          const calls = output.filter(item => item.type === "function_call");
          if (calls.length) {
            const responseTurn = responseTurns.get(id) ?? turn;
            updateStatus("thinking");
            void Promise.all(calls.map(processTool)).then(() => {
              // Never speak a late tool result over a newer user turn or a closed call.
              if (closed || responseTurn !== turn) return;
              if (!output.some(item => item.type === "message") || calls.some(item => item.name === "recall_memories")) {
                toolRounds++;
                send({ type: "response.create", ...(toolRounds >= 4 ? { response: { tool_choice: "none" } } : {}) });
              } else if (!playing) readyStatus();
            });
          } else if (!playing) readyStatus();
          return;
        }
        case "error":
          fail(greetingPending ? GREETING_ERROR : CONNECTION_ERROR);
          return;
      }
    };

    const offer = await peer.createOffer();
    controller.signal.throwIfAborted();
    await peer.setLocalDescription(offer);
    controller.signal.throwIfAborted();
    const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
      signal: controller.signal,
    });
    if (!answer.ok) throw new Error(CONNECTION_ERROR);
    const sdp = await answer.text();
    controller.signal.throwIfAborted();
    await peer.setRemoteDescription({ type: "answer", sdp });
    controller.signal.throwIfAborted();

    return {
      hasMic: !!mic,
      sendText(text) {
        if (closed || greetingPending || !text.trim()) return;
        turn++; toolRounds = 0;
        send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
        updateStatus("thinking");
        send({ type: "response.create" });
      },
      setMic(on) {
        micRequested = on;
        applyMic();
        if (!closed && !greetingPending && !playing && (currentStatus === "listening" || currentStatus === "idle")) readyStatus();
      },
      setSound(on) { audio.muted = !on; },
      close: () => close(),
    };
  } catch (error) {
    close();
    throw error;
  }
}

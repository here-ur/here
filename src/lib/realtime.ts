// 브라우저 ↔ OpenAI realtime (WebRTC). 진짜 키는 서버에만 있고, 여기서는 /api/realtime이 준 임시 키만 쓴다.

export type Handlers = {
  onStatus: (s: "listening" | "thinking" | "speaking" | "idle") => void;
  onUserText: (text: string) => void; // 사용자 말이 글로 확정됐을 때
  onUserPartial: (text: string) => void; // 받아쓰는 중(위기 표현을 빨리 잡으려고)
  onAssistantPartial: (text: string) => void;
  onAssistantText: (text: string) => void;
  onTool: (name: "show_crisis_help" | "show_clinics") => void;
  onError: (message: string) => void;
};

export type Realtime = {
  sendText: (text: string) => void;
  setMic: (on: boolean) => void;
  setSound: (on: boolean) => void;
  close: () => void;
  hasMic: boolean;
};

export async function connectRealtime(h: Handlers, persona: { name?: string; voice?: string } = {}): Promise<Realtime> {
  const res = await fetch("/api/realtime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persona), // 온보딩에서 고른 몽글이 이름·목소리. 서버가 다시 거른다.
  });
  if (!res.ok) throw new Error("몽글이와 연결하지 못했어요. 조금 뒤에 다시 해 줘.");
  const { key } = await res.json();

  const pc = new RTCPeerConnection();
  const audioEl = new Audio();
  audioEl.autoplay = true;
  pc.ontrack = (e) => (audioEl.srcObject = e.streams[0]);

  let mic: MediaStream | null = null;
  try {
    // 스피커로 나온 몽글이 목소리를 다시 내 말로 듣지 않게 에코 제거를 켠다.
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    pc.addTrack(mic.getTracks()[0], mic);
  } catch {
    pc.addTransceiver("audio", { direction: "recvonly" }); // 마이크 없이 글로만 대화
  }

  const dc = pc.createDataChannel("oai-events");
  const send = (event: object) => dc.readyState === "open" && dc.send(JSON.stringify(event));
  const userParts = new Map<string, string>();
  let assistant = "";
  let playing = false; // 소리 재생 신호(output_audio_buffer.*)를 받았는지

  dc.onopen = () => send({ type: "response.create" }); // 몽글이가 먼저 인사
  dc.onmessage = (msg) => {
    const e = JSON.parse(msg.data);
    switch (e.type) {
      case "input_audio_buffer.speech_started":
        return h.onStatus("listening");
      case "input_audio_buffer.speech_stopped":
        return h.onStatus("thinking");
      case "conversation.item.input_audio_transcription.delta": {
        const text = (userParts.get(e.item_id) ?? "") + e.delta;
        userParts.set(e.item_id, text);
        return h.onUserPartial(text);
      }
      case "conversation.item.input_audio_transcription.completed":
        userParts.delete(e.item_id);
        if (e.transcript?.trim()) h.onUserText(e.transcript.trim());
        return;
      case "response.output_audio_transcript.delta":
        if (!assistant) h.onStatus("speaking"); // 재생 신호가 늦어도 "생각 중"에 멈추지 않게
        assistant += e.delta;
        return h.onAssistantPartial(assistant);
      case "response.output_audio_transcript.done":
        assistant = "";
        if (e.transcript?.trim()) h.onAssistantText(e.transcript.trim());
        return;
      case "output_audio_buffer.started":
        playing = true;
        return h.onStatus("speaking");
      case "output_audio_buffer.stopped":
        playing = false;
        return h.onStatus("idle");
      case "response.function_call_arguments.done":
        if (e.name === "show_crisis_help" || e.name === "show_clinics") h.onTool(e.name);
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: e.call_id, output: '{"shown":true}' } });
        return;
      case "response.done": {
        // 도구만 부르고 말은 안 했으면, 결과를 받은 뒤 이어서 말하게 한다.
        const out: { type: string }[] = e.response?.output ?? [];
        if (out.some((o) => o.type === "function_call") && !out.some((o) => o.type === "message")) {
          send({ type: "response.create" });
        } else if (!playing) {
          h.onStatus("idle"); // 재생 신호가 오지 않는 환경에서도 대기로 돌아온다
        }
        return;
      }
      case "error":
        console.error("realtime", e.error);
        return h.onError("잠시 연결이 어려워요. 조금 뒤에 다시 해 줘.");
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
    body: offer.sdp,
  });
  if (!answer.ok) throw new Error("몽글이와 연결하지 못했어요. 조금 뒤에 다시 해 줘.");
  await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });

  return {
    hasMic: !!mic,
    sendText(text) {
      send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
      send({ type: "response.create" });
    },
    setMic(on) {
      mic?.getTracks().forEach((t) => (t.enabled = on));
    },
    setSound(on) {
      audioEl.muted = !on;
    },
    close() {
      dc.close();
      pc.close();
      mic?.getTracks().forEach((t) => t.stop());
      audioEl.srcObject = null;
    },
  };
}

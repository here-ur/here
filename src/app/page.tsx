"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasCrisisSignal } from "@/lib/crisis";
import { companionState } from "@/lib/companion-state";
import { ChatRequestError, requestChat } from "@/lib/chat";
import { type Msg, type Session, loadStoredSessions, pruneLog, saveSession } from "@/lib/log";
import { DEFAULT_COMPANION, type Profile, clearProfile, josa, parseProfile, profileRaw, saveProfile } from "@/lib/onboarding";
import { type Realtime, connectRealtime } from "@/lib/realtime";
import { displayNameForServer } from "@/lib/friends";
import { requestQuotaStatus } from "@/lib/quota-status";
import { syncReport } from "@/lib/report";
import { browserSupabase } from "@/lib/supabase";
import AuthGate from "./AuthGate";
import MicrophonePermissionGate from "./MicrophonePermissionGate";
import { Crisis109 } from "./Conversation";
import Customize from "./Customize";
import Drawer from "./Drawer";
import Friends from "./Friends";
import HomeScreen from "./HomeScreen";
import HomeEntryGreeting from "./HomeEntryGreeting";
import GetHelp from "./GetHelp";
import Report from "./Report";
import Onboarding from "./Onboarding";

type Status = "connecting" | "idle" | "listening" | "thinking" | "speaking";

const hint = (status: Status, name: string) =>
  ({
    connecting: "",
    idle: `편하게 말해요. ${josa(name, "이", "가")} 듣고 있어요`,
    listening: "듣고 있어요",
    thinking: "생각하는 중…",
    speaking: `${josa(name, "이", "가")} 말하는 중`,
  })[status];

const noSubscribe = () => () => {};

// 개발 중 화면 확인용 프로필. 브라우저 저장소에는 온보딩 완료로 기록하지 않는다.
const DEV_PROFILE: Profile | null =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_SKIP_ONBOARDING === "true"
    ? { nickname: "", companion: DEFAULT_COMPANION, shape: "cloud", color: "lavender", voice: "marin", style: "listen" }
    : null;

export default function Page() {
  return <AuthGate>{(userId, signOut) => <MicrophonePermissionGate key={userId}><Home signOut={signOut} /></MicrophonePermissionGate>}</AuthGate>;
}

function Home({ signOut }: { signOut: () => Promise<void> }) {
  // 저장된 프로필을 우선 사용하고, 개발용 건너뛰기가 켜져 있으면 기본 프로필로 홈을 연다.
  // 서버 렌더에서는 localStorage를 모르니 undefined로 비워 둔다.
  const storedProfile = useSyncExternalStore(noSubscribe, profileRaw, () => undefined);
  const [newProfile, setNewProfile] = useState<Profile | null>(null);
  const profile = newProfile ?? (storedProfile === undefined ? undefined : (parseProfile(storedProfile) ?? DEV_PROFILE));

  const [justMet, setJustMet] = useState(false); // 온보딩을 막 끝냈으면 홈에서 몽글이가 처음 인사한다
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [live, setLive] = useState(""); // 몽글이가 말하는 중인 문장
  const [status, setStatus] = useState<Status>("idle");
  const [crisis, setCrisis] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [hearing, setHearing] = useState(false); // 음성에서 사용자가 말하는 중(몽글이 반응용)
  const [hasMic, setHasMic] = useState(false);
  const [typing, setTyping] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [error, setError] = useState("");
  const [memoryWarning, setMemoryWarning] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [captions, setCaptions] = useState(false); // 자막: 소리가 안 들릴 때를 위해
  const [headline, setHeadline] = useState<string | null>(null);
  const [homeGreetingDone, setHomeGreetingDone] = useState(false);
  const [homeSpeaking, setHomeSpeaking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // Home is keyed by the authenticated account. Do not persist personalised copy on the device.
    void (async () => {
      try {
        const client = browserSupabase();
        if (!client) return;
        const { data } = await client.auth.getSession();
        if (!data.session) return;
        const response = await fetch("/api/home-greeting", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!controller.signal.aborted && typeof result.headline === "string" && result.headline.length <= 100) setHeadline(result.headline);
      } catch { /* The default greeting keeps the home usable when personalisation is unavailable. */ }
    })();
    return () => controller.abort();
  }, []);

  // 친구에게 보일 닉네임만 서버에 맞춰 둔다. 실패해도 홈은 그대로 쓴다.
  const nickname = profile?.nickname;
  useEffect(() => {
    const name = displayNameForServer(nickname);
    if (!name) return;
    void browserSupabase()?.rpc("set_display_name", { p_name: name }).then(() => {}, () => {});
  }, [nickname]);

  // 원문이 30일이 지나 지워지기 전에 날짜별 숫자로 옮겨 두고, 그다음에 오래된 원문을 지운다.
  const companionName = profile?.companion;
  useEffect(() => {
    syncReport(loadStoredSessions(), Date.now(), companionName ? [companionName] : []);
    pruneLog();
  }, [companionName]);

  const rt = useRef<Realtime | null>(null);
  const session = useRef<Session | null>(null);
  const connectionAttempt = useRef(0);
  const voiceRequest = useRef<AbortController | null>(null);
  const chatRequest = useRef<AbortController | null>(null);

  useEffect(() => () => { connectionAttempt.current += 1; voiceRequest.current?.abort(); rt.current?.close(); chatRequest.current?.abort(); }, []);

  const connecting = status === "connecting";


  function add(msg: Msg) {
    setMessages((prev) => {
      const next = [...prev, msg];
      if (session.current) saveSession({ ...session.current, messages: next });
      return next;
    });
  }

  function cancelChat() {
    chatRequest.current?.abort();
    chatRequest.current = null;
    setPendingText("");
    setStatus("idle");
  }

  async function accessToken(): Promise<string> {
    const { data } = await browserSupabase()!.auth.getSession();
    if (!data.session?.access_token) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
    return data.session.access_token;
  }

  /** 글 대화는 마이크 연결 없이 서버의 Runyour AI 경로로만 보낸다. */
  async function sendChat() {
    const text = draft.trim();
    if (!text || chatRequest.current) return;
    if (hasCrisisSignal(text)) setCrisis(true);
    session.current ??= { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), messages: [] };
    const controller = new AbortController();
    chatRequest.current = controller;
    const next: Msg[] = [...messages, { role: "user", content: text, at: Date.now() }];
    setPendingText(text);
    setError("");
    setStatus("thinking");
    try {
      const token = await accessToken();
      const result = await requestChat(next.slice(-60), profile?.companion ?? DEFAULT_COMPANION, controller.signal, token);
      if (chatRequest.current !== controller) return;
      const completed: Msg[] = [...next, { role: "assistant", content: result.reply, at: Date.now() }];
      setMessages(completed);
      if (session.current) saveSession({ ...session.current, messages: completed });
      if (result.crisis) setCrisis(true);
      if (result.suggest) setSuggest(true);
      setDraft("");
    } catch (e) {
      if (chatRequest.current !== controller || controller.signal.aborted) return;
      if (e instanceof ChatRequestError) {
        if (e.crisis) setCrisis(true);
        if (e.suggest) setSuggest(true);
        setError(e.message);
      } else setError("답변을 받지 못했어요. 다시 시도해 주세요.");
      // 실패한 글은 입력창에 그대로 두고, 재시도 때 중복 대화로 보내지 않는다.
    } finally {
      if (chatRequest.current === controller) {
        chatRequest.current = null;
        setPendingText("");
        setStatus("idle");
      }
    }
  }

  /** 음성 대화만 기존 OpenAI Realtime 연결을 사용한다. */
  async function begin() {
    setHomeGreetingDone(true);
    cancelChat();
    const attempt = ++connectionAttempt.current;
    voiceRequest.current?.abort();
    const controller = new AbortController();
    voiceRequest.current = controller;
    rt.current?.close();
    rt.current = null;
    const current = () => attempt === connectionAttempt.current;
    session.current ??= { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), messages: [] };
    setJustMet(false);
    setStarted(true);
    setVoiceMode(true);
    setTyping(false);
    setHearing(false);
    setLive("");
    setStatus("connecting");
    setError("");
    setMemoryWarning("");
    try {
      const token = await accessToken();
      const conn = await connectRealtime({
        onStatus: (next) => { if (current()) setStatus(next); },
        onUserPartial: (text) => {
          if (!current()) return;
          setHearing(true);
          if (hasCrisisSignal(text)) setCrisis(true);
        },
        onUserText: (text) => {
          if (!current()) return;
          setHearing(false);
          if (hasCrisisSignal(text)) setCrisis(true);
          add({ role: "user", content: text, at: Date.now() });
        },
        onAssistantPartial: (text) => { if (current()) setLive(text); },
        onAssistantText: (text) => {
          if (!current()) return;
          setLive("");
          add({ role: "assistant", content: text, at: Date.now() });
        },
        onTool: (name) => {
          if (!current()) return;
          if (name === "show_crisis_help") setCrisis(true);
          else setSuggest(true);
        },
        onError: (message) => { if (current()) setError(message); },
        onMemoryWarning: (message) => { if (current()) setMemoryWarning(message); },
      }, { name: profile?.companion, voice: profile?.voice }, controller.signal, token, { greeting: false });
      if (!current()) { conn.close(); return; }
      rt.current = conn;
      conn.setSound(true);
      conn.setMic(true);
      setMicOn(conn.hasMic);
      setHasMic(conn.hasMic);
      if (!conn.hasMic) {
        openText();
        setError("마이크를 쓸 수 없어서 글로 적을 수 있게 열어 뒀어요.");
      }
    } catch (e) {
      if (!current()) return;
      setError((e as Error).message);
      setStatus("idle");
    }
  }

  /** 채팅 진입 시 음성 연결은 닫고, 첫 전송 전에는 API를 호출하지 않는다. */
  function openText() {
    setHomeGreetingDone(true);
    setHearing(false);
    connectionAttempt.current += 1;
    voiceRequest.current?.abort();
    voiceRequest.current = null;
    rt.current?.close();
    rt.current = null;
    setMicOn(false);
    setHasMic(false);
    setVoiceMode(false);
    setLive("");
    setStatus("idle");
    setJustMet(false);
    setStarted(true);
    setTyping(true);
    setCaptions(true);
    setError("");
  }

  /** 글 대화 → 통화: 별도의 음성 연결을 시작한다. */
  function toVoice() {
    if (chatRequest.current) return;
    setTyping(false);
    setMicOn(true);
    void begin();
  }

  function closeText() {
    cancelChat();
    setTyping(false);
    setError("");
  }

  function stopVoice() {
    setHearing(false);
    connectionAttempt.current += 1;
    voiceRequest.current?.abort();
    voiceRequest.current = null;
    rt.current?.close();
    rt.current = null;
    setVoiceMode(false);
    setMicOn(false);
    setHasMic(false);
    setLive("");
    setStatus("idle");
    setError("");
  }

  function openReport() {
    setHomeGreetingDone(true);
    cancelChat();
    stopVoice();
    setShowReport(true);
  }

  function openFriends() {
    setHomeGreetingDone(true);
    cancelChat();
    stopVoice();
    setShowFriends(true);
  }

  function openHelp() {
    setHomeGreetingDone(true);
    cancelChat();
    // 사람 상담 화면에서는 AI가 계속 듣거나 말하지 않게 한다.
    stopVoice();
    setShowHelp(true);
  }

  if (profile === undefined) return <main className="app-frame bg-[#FAFCFE]" />; // 저장소를 읽기 전 한순간

  if (profile === null) {
    return (
      <Onboarding
        onDone={(p) => {
          saveProfile(p);
          setNewProfile(p);
          setJustMet(true);
        }}
      />
    );
  }

  const who = { name: profile.companion, shape: profile.shape ?? "cloud", color: profile.color ?? "lavender" };
  if (showHelp) return <GetHelp color={who.color} crisis={crisis} onBack={() => setShowHelp(false)} />;

  if (showFriends) return <Friends who={who} onBack={() => setShowFriends(false)} />;

  if (showReport) return <Report who={who} accessToken={accessToken} onBack={() => setShowReport(false)} />;

  const listening = !error && hasMic && micOn && (status === "listening" || status === "idle");
  const lastAssistant = live || messages.findLast((m) => m.role === "assistant")?.content;
  const statusText = !micOn && status === "idle" ? "마이크가 꺼져 있어요" : hint(status, who.name);

  {
    const me = { ...profile, shape: who.shape, color: who.color };
    return (
      <HomeScreen
        profile={me}
        greet={justMet}
        headline={headline}
        onVoice={toVoice}
        onText={openText}
        onReport={openReport}
        onMenu={() => { setHomeGreetingDone(true); setShowMenu(true); }}
        chat={{
          open: typing,
          messages: pendingText ? [...messages, { role: "user", content: pendingText }] : messages,
          draft,
          sending: Boolean(pendingText),
          error: voiceMode ? "" : error,
          state: companionState({ error: Boolean(error), speaking: !homeGreetingDone && homeSpeaking, thinking: Boolean(pendingText), composing: typing && Boolean(draft.trim()) }),
          onDraft: setDraft,
          onSend: () => { void sendChat(); },
          onClose: closeText,
        }}
        voice={voiceMode ? {
          state: companionState({ error: Boolean(error), connecting, listening, thinking: status === "thinking", speaking: status === "speaking" }),
          connecting,
          listening,
          micOn,
          hasMic,
          statusText,
          error,
          caption: captions ? lastAssistant : undefined,
          warning: memoryWarning,
          hearing,
          onEnd: stopVoice,
          onMic: () => {
            if (error) { rt.current?.close(); rt.current = null; void begin(); return; }
            rt.current?.setMic(!micOn);
            if (!micOn) rt.current?.setSound(true);
            setMicOn(!micOn);
          },
        } : undefined}
        notice={started && (crisis || suggest) ? <div className="flex flex-col items-center gap-3">
          {crisis && <Crisis109 className="w-full" />}
          {suggest && <button onClick={openHelp} className="ui-press h-11 rounded-full bg-white px-5 text-t4 font-bold text-[#1F2A55]">도움받기</button>}
        </div> : undefined}
      >
        {!homeGreetingDone && <HomeEntryGreeting name={profile.companion} voice={profile.voice} onSpeaking={setHomeSpeaking} onDone={setHomeGreetingDone} />}
        <Drawer
          open={showMenu}
          profile={me}
          onClose={() => setShowMenu(false)}
          onReport={() => {
            setShowMenu(false);
            openReport();
          }}
          onCustomize={() => {
            setShowMenu(false);
            setCustomizing(true);
          }}
          onHelp={() => {
            setShowMenu(false);
            openHelp();
          }}
          onFriends={() => {
            setShowMenu(false);
            openFriends();
          }}
          onSignOut={() => { void signOut(); }}
          loadQuota={async (signal) => requestQuotaStatus(await accessToken(), signal)}
          onReset={() => {
            if (!window.confirm(`${profile.companion} 설정을 지우고 처음부터 다시 할까요? 대화 기록은 그대로 남아요.`)) return;
            clearProfile();
            location.reload();
          }}
        />
        {customizing && (
          <Customize
            profile={me}
            onClose={() => setCustomizing(false)}
            onSave={(p) => {
              saveProfile(p);
              setNewProfile(p);
              setCustomizing(false);
            }}
          />
        )}
      </HomeScreen>
    );
  }

}

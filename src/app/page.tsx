"use client";

import { useConversationHistory } from "./use-conversation-history";
import { Button } from "./ui/Button";
import { safeHomeOpener } from "@/lib/home-opener";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { hasCrisisSignal } from "@/lib/crisis";
import { companionState } from "@/lib/companion-state";
import { ChatQueue, queuedChatContext } from "@/lib/chat-queue";
import { loadRecentChatHistory, mergeChatHistory } from "@/lib/chat-context";
import type { HistoryMessage } from "@/lib/conversation-history";
import { ChatRequestError, requestChat } from "@/lib/chat";
import { waitForCatYawn } from "@/lib/cat-yawn";
import { type Msg, type Session, loadStoredSessions, pruneLog, saveSession } from "@/lib/log";
import { DEFAULT_COMPANION, type Profile } from "@/lib/onboarding";
import { useAccountActivity } from "./use-account-activity";
import { useAccountProfile } from "./use-account-profile";
import { type Realtime, type Handlers } from "@/lib/realtime";
import { connectLive } from "@/lib/live";
import { muteSfx } from "@/lib/sfx";
import { displayNameForServer } from "@/lib/friends";
import { requestQuotaStatus } from "@/lib/quota-status";
import { syncReport } from "@/lib/report";
import { browserSupabase } from "@/lib/supabase";
import type { SearchSource } from "@/lib/web-search-protocol";
import AuthGate, { type SignOut } from "./AuthGate";
import { acceptMemoryConsent, memoryConsentAvailable } from "./MemoryConsentGate";
import { WITHDRAW_DONE_MESSAGE, withdrawMember } from "@/lib/member-withdrawal";
import { clearAccountStorage, setLocalOwner } from "@/lib/local-scope";
import { devToolsVisible } from "@/lib/deploy-env";
import { useMicrophoneAsk } from "./MicrophoneAsk";
import HomeHint from "./HomeHint";
import { homeHintSeen, markHomeHintSeen } from "@/lib/home-hint";
import { Crisis109 } from "./Conversation";
import ComingSoon, { type SoonFeature } from "./ComingSoon";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import Customize from "./Customize";
import Drawer from "./Drawer";
import { pendingFriendInvite } from "@/lib/friend-connections";
import Friends from "./Friends";
import HomeScreen from "./HomeScreen";
import GetHelp from "./GetHelp";
import Report, { type ReportMode } from "./Report";
import Onboarding from "./Onboarding";
import MemberBasicsStage from "./MemberBasicsStage";
import { MemberBasicsContext } from "./member-basics-context";
import { StageHandoff } from "./sheet-handoff";
import CatLoading from "./CatLoading";

type Status = "connecting" | "idle" | "listening" | "thinking" | "speaking";


// 개발 중 화면 확인용 프로필. 브라우저 저장소에는 온보딩 완료로 기록하지 않는다.
const DEV_PROFILE: Profile | null =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_SKIP_ONBOARDING === "true"
    ? { nickname: "", companion: DEFAULT_COMPANION, shape: "cloud", color: "lavender", voice: "marin", style: "listen" }
    : null;

export default function Page() {
  useEffect(() => { pendingFriendInvite(); }, []);
  return <AuthGate>{(userId, signOut) => <Account key={userId} userId={userId} signOut={signOut} />}</AuthGate>;
}

/** 로그인한 계정의 화면. 캐릭터를 처음부터 다시 만들면(이 기기에서든 다른 기기에서든) 페이지를 새로 고치지 않고 홈만 새로 열어
 * 캐릭터 만나기부터 시작한다. 새로 고치면 앱을 처음 여는 것처럼 로그인 확인 화면(환영 그림)이 잠깐 보였다가 넘어갔다.
 * 새로 연 홈은 계정에 캐릭터가 없다는 걸 이미 알고 시작해서 '설정을 불러오는 중' 화면도 거치지 않는다(계정 확인은 뒤에서 그대로 한다). */
function Account({ userId, signOut }: { userId: string; signOut: SignOut }) {
  const [run, setRun] = useState(0);
  const restart = useCallback(() => setRun((n) => n + 1), []);
  const fromConsent = useContext(StageHandoff);
  // run > 0: 개발용 '처음부터 다시 만들기'로 다시 연 온보딩. 생일·성별까지 처음과 같은 전체 흐름을 보여 준다.
  return <Home key={run} userId={userId} signOut={signOut} startEmpty={run > 0 || fromConsent?.newMember === true} afterConsent={run === 0 && fromConsent?.consented === true} replay={run > 0} onRestart={restart} />;
}

/** 이 기기에 남은 설정이 없어 계정의 캐릭터 설정을 처음 불러오는 동안(새로 가입했거나 이 기기에서 처음 로그인).
 * 로그인·기억 동의에서 넘어오는 화면 전환 뒤라 그루밍하는 고양이(로딩 화면 시안 B)로 기다린다. 로그인 확인에서 곧바로 이어지면 같은 낮잠 고양이를 이어 쓴다.
 * 8초가 넘으면 다시 시도·로그아웃을, 불러오지 못하면 한 줄과 다시 확인·로그아웃을 보여 준다(이때는 메뉴가 없어 나갈 곳이 여기뿐이다). */
function ProfileLoading({ error, onRetry, onSignOut }: { error: string; onRetry: () => void; onSignOut: () => void }) {
  return <CatLoading scene="groom" label="캐릭터 설정을 불러오고 있어요" error={error || undefined} onRetry={onRetry} onSignOut={onSignOut} />;
}

function Home({ userId, signOut, startEmpty, afterConsent, replay = false, onRestart }: { userId: string; signOut: SignOut; startEmpty: boolean; afterConsent: boolean; replay?: boolean; onRestart: () => void }) {
  const account = useAccountProfile(userId, { startEmpty, onRemoteReset: onRestart });
  // 개발용 다시 만들기: 기억 기능이 켜진 서버면 약속 장면에서 동의 칸까지 다시 보여 준다. 무대는 시작할 때 정하므로 먼저 확인한다.
  const [replayConsent, setReplayConsent] = useState<boolean | undefined>(replay ? undefined : false);
  useEffect(() => {
    if (!replay) return;
    let active = true;
    memoryConsentAvailable().then((on) => { if (active) setReplayConsent(on); }, () => { if (active) setReplayConsent(false); });
    return () => { active = false; };
  }, [replay]);
  const basics = useContext(MemberBasicsContext);
  const activity = useAccountActivity(userId);
  const profile = account.profile === null ? DEV_PROFILE : account.profile;
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);

  const [justMet, setJustMet] = useState(false); // 온보딩을 막 끝냈으면 홈에서 몽글이가 처음 인사한다
  // 홈 첫 방문 안내: 이 기기에서 한 번. 글·음성·메뉴를 열거나 안내를 누르면 닫는다.
  const [showHint, setShowHint] = useState(() => !homeHintSeen());
  const dismissHint = useCallback(() => { markHomeHintSeen(); setShowHint(false); }, []);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const history = useConversationHistory(userId, messages);
  const [status, setStatus] = useState<Status>("idle");
  const [crisis, setCrisis] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // 도움받기·친구·구름 정원은 보류(준비 중): 메뉴·버튼은 그대로 두고 누르면 '준비 중' 안내만 잠깐 띄운다.
  const [soon, setSoon] = useState<{ feature: SoonFeature; n: number } | null>(null);
  const showSoon = useCallback((feature: SoonFeature) => setSoon((prev) => ({ feature, n: (prev?.n ?? 0) + 1 })), []);
  const hideSoon = useCallback(() => setSoon(null), []);
  const [micOn, setMicOn] = useState(true);
  const [hearing, setHearing] = useState(false); // 음성에서 사용자가 말하는 중(몽글이 반응용)
  const [hasMic, setHasMic] = useState(false);
  const [typing, setTyping] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [yawning, setYawning] = useState(false);
  const [draft, setDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatFailed, setChatFailed] = useState(false);
  const chatQueue = useRef<ChatQueue<HistoryMessage> | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  const draftRef = useRef("");
  const [error, setError] = useState("");
  const [memoryWarning, setMemoryWarning] = useState("");
  const [reportMode, setReportMode] = useState<ReportMode | null>(null);
  const [searchSources, setSearchSources] = useState<SearchSource[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetNote, setResetNote] = useState<{ text: string; error?: boolean } | null>(null); // 처음부터 다시 만들기의 진행·실패
  const [customizing, setCustomizing] = useState(false);
  const [showFriends, setShowFriends] = useState(() => Boolean(pendingFriendInvite()));
  const [headline, setHeadline] = useState<string | null>(null);
  const headlineLocked = useRef(false);
  const openingLine = safeHomeOpener(headline);
  const outputLevel = useRef(0);
  const voiceClickedAt = useRef<number | undefined>(undefined);
  const outputShape = useRef<import("@/lib/mouth-shape").MouthShape>("rest");
  // 음성 대화 중에는 효과음이 마이크에 섞이지 않게 모두 쉰다.
  useEffect(() => { muteSfx(voiceMode); return () => muteSfx(false); }, [voiceMode]);

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
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]), cache: "no-store",
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!controller.signal.aborted && !headlineLocked.current && typeof result.headline === "string" && result.headline.length <= 100) setHeadline(result.headline);
      } catch { /* No generic greeting when personalisation is unavailable. */ }
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

  useEffect(() => {
    const dispose = () => {
      connectionAttempt.current += 1;
      voiceRequest.current?.abort(); voiceRequest.current = null;
      rt.current?.close(); rt.current = null;
      chatRequest.current?.abort(); chatQueue.current?.cancel();
    };
    // A cached page must return to the disconnected home state when restored.
    const leave = () => {
      dispose();
      setVoiceMode(false); setMicOn(false); setHasMic(false);
      setYawning(false); setHearing(false); setStatus('idle');
    };
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); dispose(); };
  }, []);

  const connecting = status === "connecting";


  function commitMessages(next: Msg[]) {
    messagesRef.current = next;
    setMessages(next);
    if (session.current) saveSession({ ...session.current, messages: next });
  }

  function add(msg: Msg) {
    const saved = { ...msg, id: crypto.randomUUID(), at: msg.at ?? Date.now() };
    history.append([saved]);
    commitMessages([...messagesRef.current, saved]);
  }

  function cancelChat() {
    chatQueue.current?.cancel();
    chatQueue.current = null;
    chatRequest.current?.abort();
    chatRequest.current = null;
    setChatSending(false);
    setChatFailed(false);
    setStatus("idle");
  }

  async function accessToken(): Promise<string> {
    const { data } = await browserSupabase()!.auth.getSession();
    if (!data.session?.access_token) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
    return data.session.access_token;
  }

  /** Sent messages are immediately recorded; one reply consumes each queued group. */
  function sendChat() {
    const text = draftRef.current.trim();
    if (!text) return;
    if (hasCrisisSignal(text)) setCrisis(true);
    session.current ??= { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), messages: [] };
    headlineLocked.current = true;
    const message: HistoryMessage = { id: crypto.randomUUID(), role: "user", content: text,
      at: Math.max(Date.now(), (messagesRef.current.at(-1)?.at ?? 0) + 1) };
    history.append([message]);
    commitMessages([...messagesRef.current, message]);
    draftRef.current = "";
    setDraft("");
    setError("");
    chatQueue.current ??= new ChatQueue<HistoryMessage>({
      state: (busy, failed) => { setChatSending(busy); setChatFailed(failed); setStatus(busy ? "thinking" : "idle"); },
      error: (e) => {
        if (e instanceof ChatRequestError) {
          if (e.crisis) setCrisis(true);
          if (e.suggest) setSuggest(true);
          setError(e.message);
        } else setError("답변을 받지 못했어요. 보낸 메시지는 남아 있어요. 다시 시도해 주세요.");
      },
      run: async (batch, signal) => {
        const controller = new AbortController();
        chatRequest.current = controller;
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        try {
          const last = batch.at(-1)!;
          const token = await accessToken();
          const saved = await loadRecentChatHistory(token, controller.signal);
          if (signal.aborted) return;
          // Read the ref after loading: new queued messages/replies may arrive in the meantime.
          const context = queuedChatContext(mergeChatHistory(saved, messagesRef.current), batch);
          const assistantId = crypto.randomUUID();
          const result = await requestChat(context, { name: profile?.companion ?? DEFAULT_COMPANION, nickname: profile?.nickname, style: profile?.style }, controller.signal, token,
            { batchId: crypto.randomUUID(), userMessageId: last.id, assistantMessageId: assistantId, userAt: last.at, assistantAt: Math.max(Date.now(), last.at + 1) });
          if (signal.aborted) return;
          const reply: HistoryMessage = { id: assistantId, role: "assistant", content: result.reply, at: result.assistantAt ?? Date.now() };
          history.append([reply]);
          commitMessages([...messagesRef.current, reply]);
          if (result.crisis) setCrisis(true);
          if (result.suggest) setSuggest(true);
        } finally {
          signal.removeEventListener("abort", abort);
          if (chatRequest.current === controller) chatRequest.current = null;
        }
      },
    });
    chatQueue.current.enqueue(message);
  }

  /** 마이크 버튼을 눌렀을 때만 유료 Live 연결을 시작한다. */
  async function begin(startedAt = performance.now()) {
    headlineLocked.current = true;
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
    setStatus("connecting");
    setError("");
    setMemoryWarning("");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setYawning(!reducedMotion);
    // Animate while connecting; the intro must not delay microphone/network setup.
    void waitForCatYawn(controller.signal, reducedMotion).then(() => {
      if (current()) setYawning(false);
    }).catch(() => {});
    try {
      const token = await accessToken();
      if (!current()) return;
      const handlers: Handlers = {
        onOutputLevel: (level, shape) => { if (current()) { outputLevel.current = level; outputShape.current = shape; } },
        onStatus: (next) => { if (current()) { setStatus(next); if (next === "speaking") setYawning(false); } },
        onUserPartial: (text) => {
          if (!current()) return;
          setHearing(true);
          if (hasCrisisSignal(text)) setCrisis(true);
        },
        onUserText: (text) => {
          setHearing(false);
          if (hasCrisisSignal(text)) setCrisis(true);
          add({ role: "user", content: text, at: Date.now() });
        },
        onAssistantPartial: () => {}, // 음성 답변 자막은 표시하지 않는다. 완료된 발언은 아래에서 기록한다.
        onAssistantText: (text) => {
          add({ role: "assistant", content: text, at: Date.now() });
        },
        onTool: (name) => {
          if (!current()) return;
          if (name === "show_crisis_help") setCrisis(true);
          else setSuggest(true);
        },
        onError: (message) => { if (current()) setError(message); },
        onMemoryWarning: (message) => { if (current()) setMemoryWarning(message); },
        onSearchSources: (sources) => { if (current()) setSearchSources(sources); },
      };
      const conn = await connectLive(handlers, { name: profile?.companion, voice: profile?.voice, nickname: profile?.nickname || undefined, style: profile?.style }, controller.signal, token, { historyManaged: true, startedAt });
      if (!current()) { conn.close(); return; }
      rt.current = conn;
      conn.setSound(true);
      conn.setMic(true);
      setMicOn(conn.hasMic);
      setHasMic(conn.hasMic);
      if (!conn.hasMic) {
        openText();
        setError(conn.microphoneError ?? "마이크를 쓸 수 없어서 글로 적을 수 있게 열어 뒀어요.");
      }
    } catch (e) {
      if (!current()) return;
      setYawning(false);
      setError((e as Error).message);
      setStatus("idle");
    }
  }

  /** 채팅 진입 시 음성 연결은 닫고, 첫 전송 전에는 API를 호출하지 않는다. */
  function openText() {
    dismissHint();
    setResetNote(null);
    setYawning(false);
    headlineLocked.current = true;
    setHearing(false);
    connectionAttempt.current += 1;
    voiceRequest.current?.abort();
    voiceRequest.current = null;
    rt.current?.close();
    rt.current = null;
    setMicOn(false);
    setHasMic(false);
    setVoiceMode(false);
    setStatus("idle");
    setJustMet(false);
    setStarted(true);
    setTyping(true);
    setError("");
  }

  /** 글 대화 → 통화: 별도의 음성 연결을 시작한다. */
  function startVoice() {
    if (chatRequest.current || voiceRequest.current) return;
    setTyping(false);
    setMicOn(true);
    void begin(voiceClickedAt.current);
  }
  // 마이크 권한은 처음 마이크를 누를 때 묻는다(권한이 있거나 이미 거쳤으면 바로 연결). 글을 고르면 글 입력창을 열고 바로 포커스한다.
  // 허용 뒤에는 시트가 돌려주려는 마이크 버튼이 연결 중이라 눌리지 않으므로, 바로 옆 '음성 대화 종료' 버튼으로 포커스를 옮긴다.
  const micAsk = useMicrophoneAsk(startVoice, () => openText(),
    () => document.getElementById("home-text-draft")?.focus({ preventScroll: true }),
    () => document.getElementById("home-voice-end")?.focus({ preventScroll: true }));
  function toVoice(startedAt = performance.now()) {
    dismissHint();
    setResetNote(null);
    // 글 답변을 기다리는 중이거나 이미 음성을 여는 중(하품 포함)이면 다시 시작하지 않는다.
    if (chatRequest.current || voiceRequest.current) return;
    voiceClickedAt.current = startedAt;
    // 안내 시트가 떠도 홈 인사가 뒤에서 계속 말하지 않게 먼저 멈춘다.
    headlineLocked.current = true;
    micAsk.ask();
  }

  function closeText() {
    setTyping(false);
    setError("");
  }

  function stopVoice() {
    setYawning(false);
    setHearing(false);
    setSearchSources([]);
    connectionAttempt.current += 1;
    voiceRequest.current?.abort();
    voiceRequest.current = null;
    rt.current?.close();
    rt.current = null;
    setVoiceMode(false);
    setMicOn(false);
    setHasMic(false);
    setStatus("idle");
    setError("");
  }

  function openReport(mode: ReportMode) {
    cancelChat();
    stopVoice();
    setReportMode(mode);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 친구 기능을 다시 열 때 쓴다(지금은 보류)
  function openFriends() {
    cancelChat();
    stopVoice();
    setShowFriends(true);
  }

  /** 인사이트에서 고른 이야기 씨앗: 홈의 글 대화를 열고 몽글이가 그 주제로 먼저 말을 건다. */
  function startSeed(opener: string) {
    setReportMode(null);
    openText();
    session.current ??= { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), messages: [] };
    add({ role: "assistant", content: opener, at: Date.now() });
  }

  // 도움받기 화면(GetHelp)은 남겨 두고, 출시 전까지는 들어가는 대신 '준비 중' 안내만 보여 준다.
  function openHelpSoon() {
    showSoon("help");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 도움받기를 다시 열 때 쓴다
  function openHelp() {
    cancelChat();
    // 사람 상담 화면에서는 AI가 계속 듣거나 말하지 않게 한다.
    stopVoice();
    setShowHelp(true);
  }

  if (profile === undefined) return <ProfileLoading error={account.loadError} onRetry={account.retry} onSignOut={() => { void signOut(); }} />;

  if (profile === null && replayConsent === undefined) return <ProfileLoading error="" onRetry={account.retry} onSignOut={() => { void signOut(); }} />;

  if (profile === null) {
    // 마지막 '알겠어요' 뒤 저장하는 동안에도 같은 화면을 두고, 버튼에 진행·실패·다시 저장을 보여 준다.
    // 저장이 끝나면 홈이 온보딩의 빛이 걷히는 모션(greet)으로 바로 이어진다.
    return (
      <Onboarding
        basics={basics}
        askBasics={replay || undefined}
        consent={replayConsent ? acceptMemoryConsent : undefined}
        afterConsent={afterConsent}
        onSignOut={() => { void signOut(); }}
        saving={pendingProfile !== null && account.saving}
        saveError={pendingProfile ? account.saveError : undefined}
        onRetry={() => { if (pendingProfile) void account.save(pendingProfile); }}
        onDone={(p) => {
          setPendingProfile(p);
          void account.save(p);
          setJustMet(true);
          headlineLocked.current = true;
          setHeadline(null);
        }}
      />
    );
  }

  // 캐릭터는 있는데 성별·생년월일이 비어 있으면 홈 앞에서 그 두 장면만 묻는다.
  if (basics.needed) return <MemberBasicsStage basics={basics} nickname={profile.nickname} signOut={() => { void signOut(); }} />;

  const who = { name: profile.companion, shape: profile.shape ?? "cloud", color: profile.color ?? "lavender", accessory: profile.accessory };
  if (showHelp) return <GetHelp color={who.color} crisis={crisis} onBack={() => setShowHelp(false)} />;

  if (showFriends) return <Friends userId={userId} who={who} onBack={() => setShowFriends(false)} />;

  if (reportMode) return <Report syncError={activity.error} key={reportMode} mode={reportMode} who={who} accessToken={accessToken} onBack={() => setReportMode(null)} onSeed={startSeed} onDecorate={() => { setReportMode(null); account.clearSaveError(); setCustomizing(true); }} />;

  const listening = !error && hasMic && micOn && (status === "listening" || status === "idle");

  {
    const me = { ...profile, shape: who.shape, color: who.color };
    return (
      <HomeScreen
        profile={me}
        greet={justMet}
        headline={openingLine}
        onVoice={toVoice}
        onText={openText}
        onMenu={() => { dismissHint(); setResetNote(null); setShowMenu(true); }}
        nudge={showHint ? <HomeHint name={profile.companion} onDismiss={dismissHint} /> : undefined}
        banner={resetNote ?? undefined}
        menuButtonRef={menuButtonRef}
        outputLevel={outputLevel}
        outputShape={outputShape}
        chat={{
          open: typing,
          messages: history.messages,
          history: { loaded: history.loaded, loading: history.loading, hasMore: history.hasMore, error: history.error, onOlder: history.loadOlder },
          draft,
          sending: chatSending,
          error: voiceMode ? "" : error || history.saveError || activity.error,
          state: companionState({ error: Boolean(error), speaking: false, thinking: chatSending, composing: typing && Boolean(draft.trim()) }),
          onDraft: (value) => { draftRef.current = value; setDraft(value); },
          onRetry: chatFailed ? () => { setError(""); chatQueue.current?.retry(); } : undefined,
          onSend: () => { void sendChat(); },
          onClose: closeText,
        }}
        voice={voiceMode ? {
          state: yawning ? "yawning" : companionState({ error: Boolean(error), connecting, listening, thinking: status === "thinking", speaking: status === "speaking" }),
          connecting,
          listening,
          micOn,
          hasMic,
          error,
          sources: searchSources,
          warning: memoryWarning || history.saveError || activity.error,
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
          {suggest && <Button variant="plain" onClick={openHelpSoon} className="ui-press h-11 rounded-full bg-white px-5 text-t4 font-bold text-[#1F2A55]">도움받기</Button>}
        </div> : undefined}
      >
        {micAsk.sheet}
        <Drawer
          open={showMenu}
          profile={me}
          onClose={() => setShowMenu(false)}
          onLibrary={() => {
            setShowMenu(false);
            openReport("library");
          }}
          onCustomize={() => {
            setShowMenu(false);
            account.clearSaveError(); // 앞서 실패한 초기화의 오류를 캐릭터 화면에 끌고 가지 않는다
            setCustomizing(true);
          }}
          onHelp={() => {
            setShowMenu(false);
            openHelpSoon();
          }}
          onFriends={() => {
            setShowMenu(false);
            showSoon("friends");
          }}
          onSignOut={() => { void signOut(); }}
          loadQuota={async (signal) => requestQuotaStatus(await accessToken(), signal)}
          onReset={devToolsVisible() ? () => setConfirmReset(true) : undefined}
          onSaveNickname={(nickname) => account.save({ ...profile, nickname })}
          onWithdraw={async () => {
            const client = browserSupabase();
            if (!client) return false;
            try {
              if (await withdrawMember(client, AbortSignal.timeout(10000)) !== "ok") return false;
            } catch { return false; }
            // 서버 세션은 이미 지워졌다. 음성·글 대화를 닫고, 이 기기의 계정 기록을 지운 뒤 로그아웃한다.
            // 기록을 지우기 전에 계정 소유자를 비워 남은 작업이 다시 쓰지 못하게 한다.
            connectionAttempt.current += 1; voiceRequest.current?.abort(); rt.current?.close(); rt.current = null;
            chatRequest.current?.abort(); chatQueue.current?.cancel();
            setLocalOwner(null);
            const storage = (name: "localStorage" | "sessionStorage") => { try { return window[name]; } catch { return undefined; } };
            clearAccountStorage(userId, [storage("localStorage"), storage("sessionStorage")]);
            void signOut(WITHDRAW_DONE_MESSAGE);
            return true;
          }}
        />
        {confirmReset && (
          <ConfirmDialog
            title={`${profile.companion} 설정을 초기화할까요?`}
            description="캐릭터 설정을 지우고 처음부터 다시 시작해요. 대화 기록은 그대로 남아요."
            confirmLabel="초기화"
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => {
              // 메뉴를 닫아 홈에서 진행·실패를 보이게 한다. 실패하면 설정은 그대로 두고 알린다.
              setConfirmReset(false);
              setShowMenu(false);
              setResetNote({ text: "설정을 초기화하고 있어요…" });
              void account.save(null).then(ok => {
                // 홈을 새로 열어 음성·글 대화와 화면 상태를 모두 닫고 캐릭터 만나기부터 시작한다(새로 고침 없이).
                if (ok) { setPendingProfile(null); onRestart(); return; }
                account.clearSaveError();
                setResetNote({ text: "설정을 초기화하지 못했어요. 연결을 확인하고 다시 시도해 주세요.", error: true });
              });
            }}
          />
        )}
        {customizing && (
          <Customize
            profile={me}
            saving={account.saving}
            error={account.saveError}
            onSave={(p) => account.save(p)}
            onClose={() => setCustomizing(false)}
            onGarden={() => showSoon("garden")}
          />
        )}
        <ComingSoon soon={soon} onDone={hideSoon} />
      </HomeScreen>
    );
  }

}

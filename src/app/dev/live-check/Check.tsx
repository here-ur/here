"use client";
import { useEffect, useRef, useState } from "react";
import { connectLive } from "@/lib/live";
import type { Realtime } from "@/lib/realtime";
import { browserSupabase } from "@/lib/supabase";
import type { SearchSource } from "@/lib/web-search-protocol";

/** Development-only regression harness. Normal member/consent/quota checks apply.
 * A supplied audio fixture passes through the production WebRTC/transcript pipeline;
 * no fake transcript or memory result is injected. Never prints access tokens. */
export default function Check() {
  const [file, setFile] = useState<File>();
  const [status, setStatus] = useState("대기");
  const [events, setEvents] = useState<string[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [memories, setMemories] = useState<{id: string; summary: string; status: string}[]>([]);
  const [busy, setBusy] = useState(false);
  const session = useRef<Realtime | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const abort = useRef<AbortController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputAudio = useRef<AudioBufferSourceNode | null>(null);
  const baseline = useRef<Set<string> | null>(null);
  const append = (event: string) => setEvents(v => [...v, event].slice(-80));
  function stop() {
    try { inputAudio.current?.stop(); } catch { /* Source may not have started if setup failed. */ }
    inputAudio.current = null;
    session.current?.close(); session.current = null;
    clearTimeout(expiry.current); setBusy(false);
  }
  useEffect(() => () => {
    abort.current?.abort(); session.current?.close(); clearTimeout(expiry.current);
    void audio.current?.close();
  }, []);
  async function token() {
    const { data } = await browserSupabase()!.auth.getSession();
    if (!data.session) throw new Error("홈에서 개발 계정으로 먼저 로그인해 주세요.");
    return data.session.access_token;
  }
  async function getMemories(access: string) {
    const r = await fetch("/api/memories", { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" });
    if (!r.ok) throw new Error("기억 조회 실패");
    return (await r.json()).memories as typeof memories;
  }
  async function start() {
    if (!file || busy) return;
    stop(); abort.current?.abort(); await audio.current?.close();
    const context = new AudioContext(); audio.current = context;
    await context.resume();
    setBusy(true); setEvents([]); setMessages([]); setSources([]); setPartial("");
    const controller = new AbortController(); abort.current = controller;
    try {
      if (file.size > 3_000_000) throw new Error("3MB 이하의 짧은 가상 음성을 골라 주세요.");
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (buffer.duration > 40) throw new Error("40초 이하의 가상 음성이 필요해요.");
      const access = await token();
      if (!baseline.current) baseline.current = new Set((await getMemories(access)).map(m => m.id));
      const destination = context.createMediaStreamDestination();
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination); inputAudio.current = source;
      session.current = await connectLive({
        onStatus: setStatus, onError: message => { append(message); stop(); },
        onUserPartial: text => setPartial(`사용자: ${text}`), onAssistantPartial: text => setPartial(`캐릭터: ${text}`),
        onUserText: text => setMessages(v => [...v, `사용자: ${text}`]),
        onAssistantText: text => setMessages(v => [...v, `캐릭터: ${text}`]),
        onTool: name => append(name), onMemoryWarning: append, onSearchSources: setSources,
      }, {name:"보리"}, controller.signal, access, {greeting:false, inputStream:destination.stream, onDiagnostic:append});
      source.start(); append("fixture.started");
      expiry.current = setTimeout(() => { append("auto.closed"); stop(); }, 75_000);
    } catch(error) { append(String(error)); stop(); }
  }
  async function inspect() {
    try {
      const all = await getMemories(await token());
      // Display only this run's synthetic records, never an account's unrelated memories.
      const created = all.filter(m => baseline.current && !baseline.current.has(m.id) && /은하콩|선인장/.test(m.summary));
      setMemories(created); append(`memory.rows=${created.length}`);
    } catch(error) { append(String(error)); }
  }
  async function forgetFixtures() {
    try {
      const access = await token();
      const fixtures = memories.filter(m => /은하콩/.test(m.summary));
      for (const m of fixtures) {
        const response = await fetch("/api/memories", {method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${access}`},body:JSON.stringify({action:"forget",id:m.id})});
        if (!response.ok) throw new Error("테스트 기억 삭제 실패");
      }
      append(`fixture.forgotten=${fixtures.length}`); setMemories([]);
    } catch(error) { append(String(error)); }
  }
  return <main style={{padding:24, maxWidth:700, margin:"auto", overflow:"auto", height:"100dvh"}}>
    <h1>Live 개발 검증</h1><p>가상 음성 파일 → 실제 개발 API. 연결마다 새 대화. 개인정보가 없는 테스트 음성만 사용.</p>
    <label>가상 음성 파일<input aria-label="가상 음성 파일" type="file" accept="audio/*" disabled={busy} onChange={e=>setFile(e.target.files?.[0])}/></label>
    <p><button disabled={!file || busy} onClick={()=>void start()}>음성 테스트 시작</button> <button onClick={stop}>연결 종료</button> <button onClick={()=>void inspect()}>테스트 기억 확인</button></p>
    <p>상태: {status}</p><p>{partial}</p>
    <h2>대화</h2>{messages.map((m,i)=><p key={i}>{m}</p>)}
    <h2>웹 출처</h2>{sources.map(s=><p key={s.url}><a href={s.url}>{s.title}</a></p>)}
    <h2>이 실행에서 생성된 테스트 기억</h2>{memories.map(m=><p key={m.id}>{m.status}: {m.summary}</p>)}
    <button disabled={!memories.some(m=>/은하콩/.test(m.summary))} onClick={()=>void forgetFixtures()}>은하콩 테스트 기억 지우기</button>
    <h2>진행 기록</h2><pre style={{whiteSpace:"pre-wrap"}}>{events.join("\n")}</pre>
  </main>;
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserSupabase } from '@/lib/supabase';
import { isHistoryDisabled, legacyHistoryBatches, mergeHistory, HISTORY_DAYS, type HistoryMessage, type HistoryBatch, type HistoryCursor } from '@/lib/conversation-history';
import { loadStoredSessions, type Msg } from '@/lib/log';

export function useConversationHistory(userId: string, current: Msg[]) {
  const [stored,setStored]=useState<HistoryMessage[]>([]);
  const [cursor,setCursor]=useState<HistoryCursor|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [saveError,setSaveError]=useState('');
  const cursorRef=useRef<HistoryCursor|null>(null);
  const busy=useRef(false); const sending=useRef(false); const mounted=useRef(true);
  // 서버의 계정 대화 기록이 꺼져 있으면(기억 기능 꺼짐·운영) 보내기·불러오기를 멈추고 오류도 띄우지 않는다. 이 기기 기록은 그대로 쓴다.
  const disabled=useRef(false);
  const key=`here.conversation-outbox.v1.${userId}`;
  const queue=useRef<HistoryBatch[]>([]); const initialized=useRef(false);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const draft=useRef<HistoryMessage[]>([]);
  const openBatch=useRef<HistoryBatch|null>(null);
  const token=useCallback(async()=>{
    const {data}=await browserSupabase()!.auth.getSession();
    if(data.session?.user.id!==userId) throw new Error('wrong_account');
    return data.session.access_token;
  },[userId]);
  const persist=useCallback(()=>{
    try {localStorage.setItem(key,JSON.stringify(queue.current));return true;}
    catch {if(mounted.current) setSaveError('이 기기에 임시 저장하지 못했어요. 연결을 유지해 주세요.');return false;}
  },[key]);
  const flush=useCallback(async()=>{
    clearTimeout(timer.current);
    if(draft.current.length) {
      queue.current.push({id:crypto.randomUUID(),messages:draft.current}); draft.current=[]; persist();
    }
    openBatch.current=null;
    if(disabled.current || sending.current || !queue.current.length) return;
    sending.current=true;
    try {
      while(queue.current.length) {
        const batch=queue.current[0];
        // Outbox text obeys the same 30-day retention as the server.
        if(batch.messages.some(m=>m.at<=Date.now()-HISTORY_DAYS*86400000)) {queue.current.shift();persist();continue;}
        const response=await fetch('/api/conversations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await token()}`},body:JSON.stringify(batch),keepalive:true,signal:AbortSignal.timeout(12000)});
        if(!response.ok) {
          if(isHistoryDisabled(response.status,await response.json().catch(()=>null))) {disabled.current=true; if(mounted.current) setSaveError(''); return;}
          throw new Error('save_failed');
        }
        queue.current.shift();persist(); if(mounted.current) setSaveError('');
      }
    } catch {if(mounted.current) setSaveError('대화 저장을 다시 시도하고 있어요. 이 기기의 임시 기록은 유지돼요.');}
    finally {sending.current=false;}
  },[persist,token]);
  const append=useCallback((messages:HistoryMessage[])=>{
    const chunks=messages.flatMap(m=>m.content.length<=8000?[m]:Array.from({length:Math.ceil(m.content.length/8000)},(_,i)=>({...m,id:i?crypto.randomUUID():m.id,content:m.content.slice(i*8000,(i+1)*8000),at:m.at+i})));
    for(const m of chunks) {
      let batch=openBatch.current;
      if(!batch || batch.messages.length>=12 || batch.messages.reduce((n,x)=>n+x.content.length,0)+m.content.length>14000) {
        batch={id:crypto.randomUUID(),messages:[]};queue.current.push(batch);openBatch.current=batch;
      }
      batch.messages.push(m);
    }
    persist(); clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),6000);
  },[flush,persist]);
  const load=useCallback(async(older=false)=>{
    if(disabled.current) {if(mounted.current) setLoaded(true); return;}
    if(busy.current) return;
    const before=older?cursorRef.current:null;
    if(older&&!before) return;
    busy.current=true;setLoading(true);setError('');
    try {
      const query=before?`?${new URLSearchParams({before:before.at,id:before.id})}`:'';
      const response=await fetch('/api/conversations'+query,{headers:{Authorization:`Bearer ${await token()}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok) {
        if(isHistoryDisabled(response.status,await response.json().catch(()=>null))) {
          disabled.current=true;
          if(mounted.current) {setLoaded(true);setSaveError('');}
          return;
        }
        throw new Error('load_failed');
      }
      const result=await response.json();
      if(!mounted.current) return;
      setStored(prev=>mergeHistory(result.messages,prev));
      cursorRef.current=result.cursor;setCursor(result.cursor);setLoaded(true);
    } catch {if(mounted.current) setError('이전 대화를 불러오지 못했어요');}
    finally {busy.current=false;if(mounted.current) setLoading(false);}
  },[token]);
  useEffect(()=>{
    mounted.current=true;
    if(!initialized.current) {
      initialized.current=true;
      try {const items=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(items)) queue.current=items.filter(b=>Array.isArray(b.messages)&&b.messages.every((m:HistoryMessage)=>m.at>Date.now()-HISTORY_DAYS*86400000));} catch {}
      persist();
    }
    const initial=setTimeout(()=>{void (async()=>{
      const migrationKey=`${key}.imported`;
      try {
        if(!localStorage.getItem(migrationKey)) {
          const imported=await legacyHistoryBatches(loadStoredSessions());
          if(!mounted.current) return;
          const existing=new Set(queue.current.map(b=>b.id));
          queue.current.push(...imported.filter(b=>!existing.has(b.id)));
          if(persist()) localStorage.setItem(migrationKey,'1');
        }
      } catch {if(mounted.current) setSaveError('이 기기의 이전 기록을 옮기지 못했어요. 새로고침해서 다시 시도해 주세요.');}
      if(mounted.current) setStored(prev=>mergeHistory(prev,queue.current.flatMap(b=>b.messages)));
      await flush();if(mounted.current) await load();
    })();},0);
    const retry=setInterval(()=>{void flush();},15000);
    const online=()=>void flush();
    const hidden=()=>{if(document.visibilityState==='hidden') void flush();};
    window.addEventListener('online',online);window.addEventListener('pagehide',online);document.addEventListener('visibilitychange',hidden);
    return ()=>{mounted.current=false;clearTimeout(initial);clearInterval(retry);clearTimeout(timer.current);void flush();window.removeEventListener('online',online);window.removeEventListener('pagehide',online);document.removeEventListener('visibilitychange',hidden);};
  },[key,flush,load,persist]);
  const live=current.filter((m):m is HistoryMessage=>Boolean(m.id)&&typeof m.at==='number');
  return {messages:mergeHistory(stored,live),append,flush,loaded,loading,error,saveError,hasMore:!!cursor,loadOlder:()=>load(loaded),retry:()=>load(false)};
}

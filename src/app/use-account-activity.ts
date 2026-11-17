'use client';
import { useEffect, useState } from 'react';
import { browserSupabase } from '@/lib/supabase';
import { accountKey } from '@/lib/local-scope';
import { legacyActivity, cacheActivity } from '@/lib/activity-cache';
import { ACTIVITY_STORAGE_ERROR, ACTIVITY_PENDING, readActivityOutbox, writeActivityOutbox, acknowledgeActivity } from '@/lib/activity-outbox';
import { emptyActivity, parseActivity } from '@/lib/activity-types';
export function useAccountActivity(userId:string) {
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true,busy=false;let timer:ReturnType<typeof setTimeout>|undefined;
  const key=`here.activity-outbox.v1.${userId}`;
  const importedKey=`here.activity-imported.v1.${userId}`;
  const owns=()=>active&&accountKey('here.activity-outbox.v1')===key;
  async function sync() {
   if(!owns()||busy) return;
   busy=true;
   try {
    const client=browserSupabase();if(!client) throw Error('no_client');
    const {data:auth}=await client.auth.getSession();
    if(!owns()||auth.session?.user.id!==userId) return;
    const pending=readActivityOutbox(key);
    const imported=localStorage.getItem(importedKey)==='1';
    const data=imported?emptyActivity():legacyActivity();
    data.days.push(...pending.flatMap(m=>m.day?[m.day]:[]));
    data.days=[...new Map(data.days.map(d=>[d.date,d])).values()];
    data.choices.push(...pending.flatMap(m=>m.choice?[m.choice]:[]));
    data.practices.push(...pending.flatMap(m=>m.practice?[m.practice]:[]));
    data.choices=[...new Map(data.choices.sort((a,b)=>a.at-b.at).map(c=>[c.kind+':'+c.day,c])).values()];
    data.practices=[...new Map(data.practices.map(p=>[p.day+':'+p.id+':'+p.action,p])).values()];
    const hasWrites=!imported||pending.length>0;
    const response=await fetch('/api/activity',{
     method:hasWrites?'POST':'GET',headers:{Authorization:`Bearer ${auth.session.access_token}`,...(hasWrites?{'Content-Type':'application/json'}:{})},
     ...(hasWrites?{body:JSON.stringify(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(55000),
    });
    if(response.status===404) {if(owns()) setError('');return;}
    if(!response.ok) throw Error('sync_failed');
    const result=parseActivity(await response.json());
    if(!owns()) return;
    const remaining=acknowledgeActivity(pending,readActivityOutbox(key));
    cacheActivity(result,remaining);
    writeActivityOutbox(remaining,key);localStorage.setItem(importedKey,'1');setError('');
    if(remaining.length) timer=setTimeout(()=>void sync(),500);
   } catch {if(owns()) setError('정원·라이브러리 동기화를 다시 시도하고 있어요. 이 기기의 기록은 유지돼요.');}
   finally {busy=false;}
  }
  const storageError=()=>{if(owns()) setError("기기 저장 공간이 부족해 변경을 보관하지 못했어요. 저장 공간을 확보한 뒤 다시 선택해 주세요.");};
  window.addEventListener(ACTIVITY_STORAGE_ERROR,storageError);
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void sync(),600);};
  const visible=()=>{if(document.visibilityState==='visible') schedule();};
  const storage=(e:StorageEvent)=>{if(e.key===key) schedule();};
  timer=setTimeout(()=>void sync(),0);
  const retry=setInterval(()=>{if(document.visibilityState==='visible') void sync();},60000);
  window.addEventListener(ACTIVITY_PENDING,schedule);window.addEventListener('online',schedule);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener(ACTIVITY_STORAGE_ERROR,storageError);active=false;clearTimeout(timer);clearInterval(retry);window.removeEventListener(ACTIVITY_PENDING,schedule);window.removeEventListener('online',schedule);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visible);};
 },[userId]);
 return {error};
}

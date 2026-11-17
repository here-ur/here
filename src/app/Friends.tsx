"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { TextField } from './ui/TextField';
import { browserSupabase } from '@/lib/supabase';
import { inviteMessage } from '@/lib/friends';
import { friendCode, friendInviteUrl, parseConnections, parseInvitation, parseInviteDetails, pendingFriendInvite, dismissFriendInvite, type Connection, type FriendInvitation, type InviteDetails } from '@/lib/friend-connections';
import { COLORS } from '@/lib/onboarding';
import { Icon } from './art';
import { Shell, type Who } from './Conversation';
const stroke = { fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round' } as const;
const IDEAS = [
  { title: "서로의 하늘 나누기", body: "그날 하늘만 친구에게 보여요. 대화 내용은 보이지 않아요.", icon: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></> },
  { title: "응원 한마디 보내기", body: "힘든 날, 친구에게 짧은 응원을 보내요.", icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /> },
  { title: "안부 알림 받기", body: "친구가 오랜만에 들르면 살짝 알려 줘요.", icon: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z" /><path d="M10 20a2 2 0 0 0 4 0" /></> },
];

export default function Friends({who,onBack,preview=false,userId}:{who:Who;onBack:()=>void;preview?:boolean;userId?:string}) {
 const [friends,setFriends]=useState<Connection[]|null>(preview?[]:null);
 const [loadError,setLoadError]=useState('');
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [invitation,setInvitation]=useState<FriendInvitation|null>(null);
 const [showInvite,setShowInvite]=useState(false);
 const [input,setInput]=useState(()=>preview?'':pendingFriendInvite()??'');
 const [checkedCode,setCheckedCode]=useState<string|null>(null);
 const [details,setDetails]=useState<InviteDetails|null>(null);
 const [removing,setRemoving]=useState<Connection|null>(null);
 const mounted=useRef(false);const locked=useRef(false);const loadVersion=useRef(0);const headingRef=useRef<HTMLHeadingElement>(null);
 const tint=COLORS.find(c=>c.id===who.color)?.light??'#EEE8FF';
 const deep=COLORS.find(c=>c.id===who.color)?.deep??'#6A55E6';
 useEffect(()=>{mounted.current=true;headingRef.current?.focus({preventScroll:true});return()=>{mounted.current=false;};},[]);
 const rpc=useCallback(async(name:string,args?:Record<string,unknown>)=>{
  const client=browserSupabase();if(!client||!userId) throw Error('로그인 상태를 확인해 주세요.');
  const {data:auth}=await client.auth.getSession();if(auth.session?.user.id!==userId) throw Error('로그인한 계정이 바뀌었어요.');
  const {data,error:failure}=await client.rpc(name,args).abortSignal(AbortSignal.timeout(10000));
  if(failure) throw Error(failure.message==='invite_rate_limit'?'초대장을 너무 자주 만들었어요. 내일 다시 만들어 주세요.':'요청을 처리하지 못했어요. 다시 시도해 주세요.');
  if(!mounted.current) throw Error('화면을 다시 열어 주세요.');
  const {data:latest}=await client.auth.getSession();if(latest.session?.user.id!==userId) throw Error('로그인한 계정이 바뀌었어요.');
  return data;
 },[userId]);
 const load=useCallback(async()=>{
  const version=++loadVersion.current;
  try {const data=await rpc('list_friend_connections');if(mounted.current&&version===loadVersion.current){setFriends(parseConnections(data));setLoadError('');}}
  catch {if(mounted.current&&version===loadVersion.current){setFriends([]);setLoadError('친구 목록을 불러오지 못했어요.');}}
 },[rpc]);
 useEffect(()=>{
  if(preview) return;
  const timer=setTimeout(()=>void load(),0);
  const visible=()=>{if(document.visibilityState==='visible') void load();};
  document.addEventListener('visibilitychange',visible);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
 },[load,preview]);
 async function run(action:()=>Promise<void>) {
  if(locked.current) return;
  if(preview){setNotice('미리보기에서는 친구 관계를 변경하지 않아요.');return;}
  locked.current=true;setBusy(true);setError('');setNotice('');
  try {await action();} catch(e){if(mounted.current) setError(e instanceof Error?e.message:'다시 시도해 주세요.');}
  finally{locked.current=false;if(mounted.current)setBusy(false);}
 }
 async function prepareInvite() {
  await run(async()=>{const next=parseInvitation(await rpc('create_friend_invite'));setInvitation(next);setShowInvite(true);});
 }
 async function checkInvite() {
  const code=friendCode(input);
  if(!code){setDetails(null);setCheckedCode(null);setError('받은 초대 링크를 다시 확인해 주세요.');return;}
  await run(async()=>{
   const result=parseInviteDetails(await rpc('friend_invite_details',{p_code:code}));
   setDetails(result);setCheckedCode(result?code:null);
   if(!result) setError('만료됐거나 더 이상 사용할 수 없는 초대장이에요. 새 링크를 받아 주세요.');
  });
 }
 async function accept() {
  if(!checkedCode||details?.status!=='available') return;
  await run(async()=>{
   const result=await rpc('accept_friend_invite',{p_code:checkedCode});
   if(!['accepted','already_friends'].includes(result)) throw Error(result==='self'?'내 초대장으로는 친구를 추가할 수 없어요.':'사용할 수 없는 초대장이에요. 새 링크를 받아 주세요.');
   setDetails(null);setCheckedCode(null);setInput('');dismissFriendInvite();
   setNotice(result==='accepted'?'친구로 연결됐어요.':'이미 연결된 친구예요.');await load();
  });
 }
 const inviteUrl=invitation?friendInviteUrl(typeof location==='undefined'?'https://here-dev.vercel.app':location.origin,invitation.code):'';
 async function copy() {
  try{await navigator.clipboard.writeText(inviteUrl);setNotice('초대 링크를 복사했어요.');}
  catch{setError('링크를 길게 누르거나 선택해서 직접 복사해 주세요.');}
 }
 async function share() {
  if(!navigator.share){await copy();return;}
  try{await navigator.share({title:'Here! 친구 초대',text:inviteMessage(inviteUrl)});}
  catch(e){if(!(e instanceof Error&&e.name==='AbortError')) setError('공유창을 열지 못했어요. 링크를 복사해서 보내 주세요.');}
 }
 const card='here-card p-4';
 return <Shell color={who.color} bloom="soft">
  <header className="here-navbar absolute inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-10 flex h-14 items-center justify-between px-gutter">
   <Button variant="plain" onClick={onBack} aria-label="처음 화면으로" className="ui-press grid size-12 place-items-center rounded-full bg-white/72 text-[#1F2A55] shadow-[0_2px_10px_rgba(28,38,80,.05)] backdrop-blur-md"><Icon name="back" size={22}/></Button>
   <h1 ref={headingRef} tabIndex={-1} className="text-t6 font-bold outline-none">친구</h1><span className="size-12"/>
  </header>
  <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+80px)] bottom-0 overflow-y-auto px-gutter pb-10">
   {error&&!showInvite&&<p role="alert" className="mb-3 text-t3 text-ios-secondary">{error}</p>}
   {notice&&!showInvite&&<p role="status" className="mb-3 text-t3 text-ios-secondary">{notice}</p>}
   <section className={card} aria-labelledby="friends-list">
    <div className="flex items-baseline justify-between"><h2 id="friends-list" className="shrink-0 whitespace-nowrap text-t5 font-bold">친구 목록</h2><Button variant="plain" style={{width:"auto",flexShrink:0}} className="min-h-11 px-2 text-t2 text-ios-secondary" disabled={busy||preview} onClick={()=>void load()}>새로고침{friends&&friends.length>0?` · ${friends.length}명`:''}</Button></div>
    {friends===null?<p role="status" className="mt-3 text-t3 text-ios-secondary">친구를 불러오는 중…</p>:friends.length?<ul className="mt-2 flex flex-col">
     {friends.map(friend=><li key={friend.id} className="flex items-center gap-3 border-t border-[#F0F2F6] py-3 first:border-t-0">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full text-t4 font-bold" style={{background:tint,color:deep}}>{friend.name?[...friend.name][0]:'?'}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-t4 font-medium">{friend.name??'이름을 정하지 않은 친구'}</span><span className="text-t2 text-ios-secondary">{new Date(friend.connectedAt).toLocaleDateString('ko-KR')} 연결</span></span>
      <Button variant="plain" style={{width:"auto",flexShrink:0}} disabled={busy} onClick={()=>setRemoving(friend)} aria-label={`${friend.name??'이 친구'} 연결 끊기`} className="min-h-11 px-2 text-t2 text-ios-secondary">연결 끊기</Button>
     </li>)}
    </ul>:<p className="mt-3 text-t3 text-ios-secondary">{loadError||'아직 연결된 친구가 없어요.'}</p>}
    {loadError&&<Button variant="plain" onClick={()=>void load()} className="mt-2 min-h-11 text-t3 underline">다시 불러오기</Button>}
    <p className="mt-3 text-t2 text-ios-secondary">친구끼리는 닉네임과 연결 날짜만 보여요. 대화·기억·하늘 기록은 공유하지 않아요.</p>
   </section>
   <section className={`${card} mt-4`} aria-labelledby="friend-receive">
    <h2 id="friend-receive" className="text-t5 font-bold">받은 초대장</h2>
    <p className="mt-2 text-t3 text-ios-secondary">친구가 보낸 링크를 확인하고 직접 수락해 주세요.</p>
    <form className="mt-4 flex flex-col gap-3" onSubmit={e=>{e.preventDefault();void checkInvite();}}>
     <TextField label="친구 초대 링크" placeholder="초대 링크 붙여넣기" value={input} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={2048} disabled={busy} onChange={e=>{setInput(e.target.value);setDetails(null);setCheckedCode(null);setError('');}}/>
     <Button type="submit" tone="neutral" variant="tonal" disabled={busy||!input.trim()}>초대장 확인</Button>
    </form>
    {details&&<div className="mt-4 rounded-r4 bg-ios-group p-4">
     <p className="text-t4 font-medium">{details.status==='self'?'내가 만든 초대장이에요.':details.status==='already_friends'?'이미 연결된 친구예요.':`${details.name??'Here 친구'}님의 초대장이에요.`}</p>
     {details.status==='available'&&<><p className="mt-2 text-t2 text-ios-secondary">수락하면 서로 친구 목록에 추가되고 닉네임이 보여요.</p><Button className="mt-3" fullWidth loading={busy} onClick={()=>void accept()}>친구로 연결하기</Button></>}
    </div>}
    {input&&<Button variant="plain" disabled={busy} className="mt-2 min-h-11 text-t3 text-ios-secondary" onClick={()=>{dismissFriendInvite();setInput('');setDetails(null);setCheckedCode(null);setError('');}}>나중에 할게요</Button>}
   </section>
   <section className={`${card} mt-4`} aria-labelledby="friend-invite">
    <h2 id="friend-invite" className="text-t5 font-bold">친구 초대하기</h2>
    <p className="mt-2 text-t3 text-ios-secondary">초대 링크는 7일 동안 3명까지 사용할 수 있어요. 상대가 로그인 후 수락하면 연결돼요.</p>
    <Button className="mt-4" fullWidth loading={busy} onClick={()=>void prepareInvite()}>초대 링크 만들기</Button>
   </section>
   <section className={`${card} mt-4`} aria-labelledby="friends-ideas">
    <h2 id="friends-ideas" className="text-t5 font-bold">Here!에서 친구가 되면</h2>
    <ul className="mt-3 flex flex-col gap-3">{IDEAS.map(idea=><li key={idea.title} className="flex items-start gap-3"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-r3 bg-[#F4F6FB] text-[#3D4559]"><svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>{idea.icon}</svg></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-t4 font-medium">{idea.title}<span className="rounded-full bg-ios-group px-2 py-0.5 text-t1 text-ios-secondary">준비 중</span></span><span className="text-t2 text-ios-secondary">{idea.body}</span></span></li>)}</ul>
   </section>
  </div>
  {showInvite&&invitation&&<Dialog label="친구 초대장" onClose={()=>{if(!busy)setShowInvite(false);}}>
   <h2 className="text-t6 font-bold">친구 초대장</h2>
   <p className="mt-2 text-t3 text-ios-secondary">카카오·구글로 로그인한 친구가 이 초대를 수락하면 연결돼요.</p>
   <p className="mt-3 text-t2 text-ios-secondary">{new Date(invitation.expiresAt).toLocaleDateString('ko-KR')}까지 · {invitation.remaining}명 더 초대 가능</p>
   <p className="mt-4 break-all rounded-r4 bg-ios-group p-4 text-t3 select-all">{inviteUrl}</p>
   {notice&&<p role="status" className="mt-2 text-t2">{notice}</p>}{error&&<p role="alert" className="mt-2 text-t2">{error}</p>}
   <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="tonal" disabled={busy} onClick={()=>void copy()}>링크 복사</Button><Button disabled={busy} onClick={()=>void share()}>공유하기</Button></div>
   <Button variant="plain" className="mt-2 min-h-11 w-full text-t2 text-ios-secondary" disabled={busy} onClick={()=>void run(async()=>{if(await rpc('revoke_friend_invite',{p_code:invitation.code})!==true) throw Error('초대장을 취소하지 못했어요.');setInvitation(null);setShowInvite(false);setNotice('초대 링크를 취소했어요. 이미 연결된 친구는 유지돼요.');})}>이 초대 링크 취소하기</Button>
   <Button variant="plain" className="min-h-11 w-full text-t3" disabled={busy} onClick={()=>setShowInvite(false)}>닫기</Button>
  </Dialog>}
  {removing&&<ConfirmDialog title="친구 연결을 끊을까요?" description={`${removing.name??'이 친구'}님과 서로의 친구 목록에서 사라져요. 다시 연결하려면 새 초대장을 받아야 해요.`} confirmLabel="연결 끊기" onCancel={()=>setRemoving(null)} onConfirm={()=>{const friend=removing;setRemoving(null);void run(async()=>{await rpc('remove_friend_connection',{p_friend:friend.id});setNotice('친구 연결을 끊었어요.');await load();});}}/>}
 </Shell>;
}

export type Connection={id:string;name:string|null;connectedAt:string};
export type FriendInvitation={code:string;expiresAt:string;remaining:number};
export type InviteDetails={status:'self'|'available'|'already_friends';name:string|null;expiresAt?:string};
export function friendCode(input:string):string|null {
 const trimmed=input.trim();
 if(/^[a-f0-9]{32}$/.test(trimmed)) return trimmed;
 try {const u=new URL(trimmed);const code=u.searchParams.get('friend');return ['https:','http:'].includes(u.protocol)&&code&&/^[a-f0-9]{32}$/.test(code)?code:null;} catch {return null;}
}
export function friendInviteUrl(origin:string,code:string) {
 if(!/^[a-f0-9]{32}$/.test(code)) throw Error('invalid_invite');
 const url=new URL('/',origin);url.searchParams.set('friend',code);return url.toString();
}
export function parseConnections(data:unknown):Connection[] {
 if(!Array.isArray(data)) throw Error('친구 목록을 확인하지 못했어요.');
 return data.map(row=>{
  if(!row||typeof row.friend_id!=='string'||!/^[-a-f0-9]{36}$/.test(row.friend_id)||typeof row.connected_at!=='string'||!Number.isFinite(Date.parse(row.connected_at))) throw Error('친구 목록을 확인하지 못했어요.');
  return {id:row.friend_id,name:typeof row.display_name==='string'?row.display_name.trim()||null:null,connectedAt:row.connected_at};
 });
}
export function parseInvitation(data:unknown):FriendInvitation {
 const v=data as Record<string,unknown>|null;
 if(!v||typeof v.code!=='string'||!friendCode(v.code)||typeof v.expires_at!=='string'||!Number.isFinite(Date.parse(v.expires_at))||!Number.isInteger(v.remaining)||Number(v.remaining)<0||Number(v.remaining)>3) throw Error('초대장을 만들지 못했어요.');
 return {code:v.code,expiresAt:v.expires_at,remaining:Number(v.remaining)};
}
export function parseInviteDetails(data:unknown):InviteDetails|null {
 if(data===null) return null;
 const v=data as Record<string,unknown>;
 if(!v||!['self','available','already_friends'].includes(v.status as string)) throw Error('초대장을 확인하지 못했어요.');
 return {status:v.status as InviteDetails['status'],name:typeof v.display_name==='string'?v.display_name:null,expiresAt:typeof v.expires_at==='string'?v.expires_at:undefined};
}
const PENDING='here.pending-friend-invite.v1';
/** Keep an incoming link through same-tab OAuth and onboarding. Receiving a link never accepts it. */
export function pendingFriendInvite():string|null {
 if(typeof window==='undefined') return null;
 const code=friendCode(location.href);
 if(code) {try {sessionStorage.setItem(PENDING,JSON.stringify({code,at:Date.now()}));} catch {}return code;}
 try {const v=JSON.parse(sessionStorage.getItem(PENDING)||'null');return v&&Date.now()-v.at<7*86400000&&typeof v.code==='string'?friendCode(v.code):null;} catch{return null;}
}
export function dismissFriendInvite() {
 try {sessionStorage.removeItem(PENDING);} catch {}
 const url=new URL(location.href);url.searchParams.delete('friend');history.replaceState(history.state,'',url);
}

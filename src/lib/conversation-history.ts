export const HISTORY_DAYS = 30;
export const HISTORY_PAGE_SIZE = 30;
export type HistoryMessage = { id: string; role: 'user' | 'assistant'; content: string; at: number };
export type HistoryBatch = { id: string; messages: HistoryMessage[] };
export type HistoryCursor = { at: string; id: string };
/** 계정 대화 기록 기능이 꺼져 있을 때(MEMORY_ENABLED가 아니거나 운영) 서버가 함께 보내는 코드. */
export const HISTORY_DISABLED_CODE = 'conversation_disabled';
/** 서버 응답이 '기능 꺼짐'인지. 꺼져 있으면 다시 시도하거나 오류를 띄우지 않고 이 기기 기록만 쓴다. */
export function isHistoryDisabled(status: number, body: unknown): boolean {
  return status === 404 && typeof body === 'object' && body !== null && (body as { code?: unknown }).code === HISTORY_DISABLED_CODE;
}
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function parseHistoryBatch(value: unknown, now = Date.now()): HistoryBatch {
  const b = value as HistoryBatch | null;
  if (!b || !isUuid(b.id) || !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 12) throw new Error('invalid_batch');
  const ids = new Set(); let size = 0;
  const messages = b.messages.map(m => {
    if (!m || !isUuid(m.id) || ids.has(m.id) || !['user','assistant'].includes(m.role)
      || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 8000
      || !Number.isFinite(m.at) || m.at <= now - HISTORY_DAYS*86400000 || m.at > now+300000) throw new Error('invalid_message');
    ids.add(m.id); size += m.content.length;
    return {id:m.id,role:m.role,content:m.content,at:m.at};
  });
  if (size > 24000) throw new Error('batch_too_large');
  return {id:b.id,messages};
}
export function mergeHistory(older: HistoryMessage[], newer: HistoryMessage[]): HistoryMessage[] {
  return [...new Map([...older,...newer].map(m=>[m.id,m])).values()].sort((a,b)=>a.at-b.at || a.id.localeCompare(b.id));
}

// Deterministic IDs make importing the same local log safe across reloads/tabs.
export async function legacyHistoryBatches(sessions: {id:string;startedAt:number;messages:{role:'user'|'assistant';content:string;at?:number}[]}[], now=Date.now()): Promise<HistoryBatch[]> {
  const uuid=async(value:string)=>{
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    const h=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
  };
  const messages:HistoryMessage[]=[];
  for(const s of sessions) for(let index=0;index<s.messages.length;index++) {
    const m=s.messages[index];const at=m.at??s.startedAt+index;
    if(at<=now-HISTORY_DAYS*86400000 || at>now+300000 || !m.content.trim()) continue;
    for(let offset=0;offset<m.content.length;offset+=8000) messages.push({id:await uuid(`legacy:${s.id}:${index}:${offset}`),role:m.role,content:m.content.slice(offset,offset+8000),at:at+offset/8000});
  }
  messages.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const groups:HistoryMessage[][]=[];
  for(const m of messages) {
    let group=groups.at(-1);
    if(!group || group.length>=12 || group.reduce((n,x)=>n+x.content.length,0)+m.content.length>14000) {group=[];groups.push(group);}
    group.push(m);
  }
  return Promise.all(groups.map(async messages=>({id:await uuid(messages.map(m=>m.id).join(':')),messages})));
}

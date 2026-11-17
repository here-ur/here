import { refreshActivityDays } from '@/lib/account-activity-server';
import { after } from 'next/server';
import { requireMember } from '@/lib/member-auth';
import { memoryEnabled } from '@/lib/memory';
import { readSmallJson, JsonRequestError } from '@/lib/request-json';
import { HISTORY_PAGE_SIZE, isUuid, parseHistoryBatch } from '@/lib/conversation-history';
import { processConversationMemories } from '@/lib/conversation-memory';
import { requireApiQuota } from '@/lib/api-quota';
export const maxDuration=120;
const json=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function accessFor(request:Request) {
  const access=await requireMember(request);
  if(access.response) return access;
  if(!memoryEnabled(process.env)) return {response:json({error:'대화 기록을 아직 사용할 수 없어요.'},404)};
  const {data,error}=await access.supabase.rpc('conversation_is_enabled').abortSignal(AbortSignal.timeout(5000));
  if(error) return {response:json({error:'기록 설정을 확인하지 못했어요.'},503)};
  if(!data) return {response:json({error:'변경된 개인정보 이용 동의를 확인해 주세요.',code:'consent_required'},403)};
  return access;
}
function schedule(client: import('@supabase/supabase-js').SupabaseClient) {
  after(async()=>{ await Promise.allSettled([refreshActivityDays(client),processConversationMemories(client,{openaiKey:process.env.OPENAI_API_KEY||'',summaryKey:process.env.RUNYOUR_API_KEY||'',summaryBaseUrl:process.env.RUNYOUR_BASE_URL,summaryModel:process.env.MEMORY_SUMMARY_MODEL})]); });
}
export async function GET(request:Request) {
  try {
    const access=await accessFor(request); if(access.response) return access.response;
    const q=new URL(request.url).searchParams; const at=q.get('before'); const id=q.get('id');
    if((at || id) && (!at || !id || !isUuid(id) || !Number.isFinite(Date.parse(at)))) return json({error:'기록 위치를 확인해 주세요.'},400);
    const {data,error}=await access.supabase.rpc('list_conversation_messages',{p_before:at,p_id:id,p_limit:HISTORY_PAGE_SIZE+1}).abortSignal(AbortSignal.timeout(8000));
    if(error || !Array.isArray(data)) throw new Error('history_failed');
    const page=data.slice(0,HISTORY_PAGE_SIZE); const last=page.at(-1);
    schedule(access.supabase);
    return json({messages:page.reverse().map(m=>({id:m.id,role:m.role,content:m.content,at:Date.parse(m.created_at)})),cursor:data.length>HISTORY_PAGE_SIZE?{at:last.created_at,id:last.id}:null});
  } catch {return json({error:'이전 대화를 불러오지 못했어요. 다시 시도해 주세요.'},503);}
}
export async function POST(request:Request) {
  try {
    const access=await accessFor(request); if(access.response) return access.response;
    const quota=await requireApiQuota(access.supabase,'voice_memory'); if(quota) return quota;
    let batch; try {batch=parseHistoryBatch(await readSmallJson(request,5000,100000));} catch(e) {if(e instanceof JsonRequestError) throw e; return json({error:'대화 기록 형식을 확인해 주세요.'},400);}
    const {data,error}=await access.supabase.rpc('save_conversation_batch',{p_id:batch.id,p_messages:batch.messages.map(m=>({...m,at:new Date(m.at).toISOString()}))}).abortSignal(AbortSignal.timeout(8000));
    if(error || data!==true) return json({error:'대화 기록을 저장하지 못했어요.'},503);
    schedule(access.supabase); return json({saved:true});
  } catch(e) {return e instanceof JsonRequestError?json({error:e.message},e.status):json({error:'대화 기록을 저장하지 못했어요.'},503);}
}

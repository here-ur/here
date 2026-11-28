import { memoryEnabled } from '@/lib/memory';
import { requireMember } from '@/lib/member-auth';
import { JsonRequestError, readSmallJson } from '@/lib/request-json';
import { emptyActivity, parseActivity } from '@/lib/activity-types';
import { refreshActivityDays, syncAccountActivity } from '@/lib/account-activity-server';
import { requireCipher } from '@/lib/conversation-cipher';
export const maxDuration=60;
const json=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function sync(request:Request) {
 try {
  if(!memoryEnabled(process.env)) return json({error:"활동 기록 동기화가 꺼져 있어요."},404);
  const access=await requireMember(request); if(access.response) return access.response;
  const {data:enabled,error}=await access.supabase.rpc('conversation_is_enabled');
  if(error) return json({error:'기록 설정을 확인하지 못했어요.'},503);
  if(!enabled) return json({error:'개인정보 이용 동의가 필요해요.'},403);
  let input=emptyActivity();
  if(request.method==='POST') {
   const raw=await readSmallJson(request,5000,1500000);
   try {input=parseActivity(raw);} catch {return json({error:'기록 형식을 확인해 주세요.'},400);}
  }
  // Import first, then reconcile with all account messages; refresh errors remain retryable.
  await syncAccountActivity(access.supabase,input);
  const guard=requireCipher(access.userId); if(guard.response) return guard.response;
  await refreshActivityDays(access.supabase,guard.cipher);
  return json(await syncAccountActivity(access.supabase));
 } catch(e) {return e instanceof JsonRequestError?json({error:e.message},e.status):json({error:'정원·라이브러리 기록을 동기화하지 못했어요. 다시 시도할게요.'},503);}
}
export const GET=sync;
export const POST=sync;

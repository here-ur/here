import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizeDays } from './report.ts';
import type { Msg } from './log.ts';
import { emptyActivity, type ActivityData } from './activity-types.ts';
import type { UserCipher } from './conversation-cipher.ts';

/** All retained account messages, not the UI's most recent page. Keep a high-water daily
 * aggregate after originals expire. Replayed message IDs are already unique in the DB. */
// 리포트 숫자(자주 한 말·위기 표시 포함)는 원문으로 계산해야 하므로 복호화한 뒤 센다.
export async function refreshActivityDays(client: SupabaseClient, cipher: UserCipher) {
 const messages: Msg[]=[];
 let cursor='';
 for(;;) {
  let query=client.from('conversation_messages').select('id,role,content,content_key_version,created_at').order('id').limit(1000);
  if(cursor) query=query.gt('id',cursor);
  const {data,error}=await query.abortSignal(AbortSignal.timeout(8000));
  if(error) throw Error('activity_history_failed');
  for(const m of data??[]) messages.push({id:m.id,role:m.role,content:cipher.decryptContent(m.content,m.content_key_version??0),at:Date.parse(m.created_at)});
  if(!data || data.length<1000) break;
  cursor=data.at(-1)!.id;
 }
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError) throw Error('activity_user_failed');
 const profile=auth.user?.user_metadata?.here_profile_v1?.profile;
 const names=[profile?.companion,profile?.nickname].filter((v):v is string=>typeof v==='string');
 const days=summarizeDays([{id:'account',startedAt:0,messages}],names,'Asia/Seoul');
 if(!days.length) return;
 const {error}=await client.rpc('sync_account_activity',{p_days:days});
 if(error) throw Error('activity_stats_failed');
}
export async function syncAccountActivity(client: SupabaseClient, input: ActivityData=emptyActivity()): Promise<ActivityData> {
 const {data,error}=await client.rpc('sync_account_activity',{p_days:input.days,p_choices:input.choices,p_practices:input.practices});
 if(error || !data) throw Error('activity_sync_failed');
 return data as ActivityData;
}

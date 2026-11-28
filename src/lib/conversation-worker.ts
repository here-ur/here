import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decryptJobMessages, summarizeConversation } from './conversation-memory.ts';
import { serverCipherKeys, userCipher } from './conversation-cipher.ts';
import { reportError } from './error-report.ts';
import { embed, memoryEnabled, DEFAULT_SUMMARY_MODEL, type MemoryConfig } from './memory.ts';
import { memoryRetryFetch, operationMetric } from './ai-operations.ts';

type Env = Record<string,string|undefined>;
type WorkerDependencies = {
 client?: SupabaseClient;
 fetch?: typeof fetch;
 metric?: typeof operationMetric;
 cipher?: import('./conversation-cipher.ts').UserCipher;
};
const json=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

/** No service-role key. The database-issued bearer can claim one batch once, for two minutes. */
export async function handleConversationWorker(request:Request,env:Env,deps:WorkerDependencies={}) {
 if(!memoryEnabled(env)) return json({error:'disabled'},404);
 const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')??'')?.[1];
 if(!token) return json({error:'unauthorized'},401);
 if(!env.RUNYOUR_API_KEY||!env.OPENAI_API_KEY||!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return json({error:'unavailable'},503);
 const client=deps.client??createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 });
 const metric=deps.metric??operationMetric;
 const started=Date.now();
 let claimed=false;
 try {
  const {data:job,error}=await client.rpc('claim_conversation_work',{p_token:token}).abortSignal(AbortSignal.timeout(5000));
  if(error) {await reportError(client,'worker.conversation',error,{claimed:false}); return json({error:'unavailable'},503);}
  // Replayed, expired or no-longer-eligible capabilities never cause provider calls.
  if(!job) return json({processed:false},200);
  claimed=true;
  const signal=AbortSignal.timeout(45000);
  const config:MemoryConfig={openaiKey:env.OPENAI_API_KEY,summaryKey:env.RUNYOUR_API_KEY,
   summaryBaseUrl:env.RUNYOUR_BASE_URL,summaryModel:env.MEMORY_SUMMARY_MODEL,
   fetch:memoryRetryFetch(deps.fetch)};
  // 작업자는 로그인 사용자가 없으므로 DB가 넘겨준 job.user_id로 복호화·암호화한다.
  const cipher=deps.cipher??userCipher(job.user_id,serverCipherKeys(env));
  const summary=await summarizeConversation(decryptJobMessages(job.messages,cipher),config,signal,decryptJobMessages(job.context,cipher));
  const vector=await embed(summary,config,signal);
  const encrypted=cipher.encryptSummary('conversation_memories',summary);
  const {data:saved,error:saveError}=await client.rpc('finish_conversation_work',{
   p_token:token,p_summary:encrypted.value,p_embedding:JSON.stringify(vector),p_model:config.summaryModel||DEFAULT_SUMMARY_MODEL,
   p_summary_key_version:encrypted.keyVersion,
  }).abortSignal(signal);
  if(saveError) throw Error('worker_save_failed');
  metric({operation:'memory_save',outcome:saved?'ok':'skipped',durationMs:Date.now()-started});
  return json({processed:saved===true});
 } catch(e) {
  await reportError(client,'worker.conversation',e,{claimed});
  if(claimed) {
   try {await client.rpc('finish_conversation_work',{p_token:token,p_summary:null,p_embedding:null,p_model:null}).abortSignal(AbortSignal.timeout(3000));} catch { /* An expired lease is retried by the next schedule. */ }
  }
  metric({operation:'memory_save',outcome:'failed',durationMs:Date.now()-started});
  return json({error:'processing_failed'},503);
 }
}

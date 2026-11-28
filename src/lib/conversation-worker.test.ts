import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {handleConversationWorker} from './conversation-worker.ts';
import {TEST_CIPHER_ENV,testCipher} from './test-cipher.ts';
const env={MEMORY_ENABLED:'true',VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:'https://mwjwfumpxdlllikcdvkh.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test',RUNYOUR_API_KEY:'test',...TEST_CIPHER_ENV};
const USER='00000000-0000-4000-8000-000000000001';
const token='a'.repeat(64);
const req=(t=token)=>new Request('https://here-dev.vercel.app/api/internal/conversation-worker',{method:'POST',headers:{Authorization:'Bearer '+t}});
function fake(job:unknown,finish=true) {
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 const client={rpc(name:string,args:Record<string,unknown>){calls.push({name,args});return {abortSignal:async()=>({data:name==='claim_conversation_work'?job:finish,error:null})};}} as unknown as SupabaseClient;
 return {client,calls};
}
test('worker: production, wrong DB, missing config and invalid bearer cannot claim jobs',async()=>{
 const f=fake({});let called=0;const fetcher:typeof fetch=async()=>{called++;throw Error('unexpected');};
 for(const e of [{...env,VERCEL_ENV:'production'},{...env,NEXT_PUBLIC_SUPABASE_URL:'https://prod.supabase.co'},{...env,MEMORY_ENABLED:'false'}]) assert.equal((await handleConversationWorker(req(),e,{client:f.client,fetch:fetcher})).status,404);
 assert.equal((await handleConversationWorker(req('bad'),env,{client:f.client})).status,401);
 assert.equal((await handleConversationWorker(req(),{...env,RUNYOUR_API_KEY:''},{client:f.client})).status,503);
 assert.equal(f.calls.length,0);assert.equal(called,0);
});
test('worker: expired/replayed token does not call models or reveal content',async()=>{
 const f=fake(null);
 const res=await handleConversationWorker(req(),env,{client:f.client,fetch:async()=>{throw Error('must not call');}});
 assert.deepEqual(await res.json(),{processed:false});assert.equal(f.calls.length,1);
});
test('worker: summary and embedding saved under the capability, not a supplied account',async()=>{
 const f=fake({user_id:USER,messages:testCipher(USER).encryptBatch([{id:'m1',role:'user',content:'가상 테스트: 종이배 만들기를 좋아해',at:'2026-11-26T00:00:00Z'}]).messages.map(m=>({role:m.role,content:m.content,content_key_version:m.key_version})),context:[]});
 const requests:string[]=[];const bodies:string[]=[];
 const res=await handleConversationWorker(req(),env,{client:f.client,metric:()=>{},fetch:async(url,init)=>{
  requests.push(String(url));bodies.push(String(init?.body));
  if(String(url).endsWith('/responses')) return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'사용자는 종이배 만들기를 좋아한다고 말했다.'})}]}]});
  return Response.json({model:'text-embedding-3-large',data:[{embedding:Array.from({length:1536},(_,i)=>i?0:1)}]});
 }});
 assert.deepEqual(await res.json(),{processed:true});
 assert.deepEqual(requests,['https://api.runyour.ai/v1/responses','https://api.runyour.ai/v1/embeddings']);
 assert.equal(f.calls[1].args.p_model,'openai/gpt-5.6-luna');assert.equal(f.calls[1].args.p_token,token);
 assert.equal('user_id' in f.calls[1].args,false);
 // AI에는 원문을, DB에는 암호문만 보낸다
 assert.match(bodies[0],/종이배 만들기를 좋아해/);
 assert.equal(f.calls[1].args.p_summary_key_version,1);assert.doesNotMatch(String(f.calls[1].args.p_summary),/종이배/);
 assert.equal(testCipher(USER).decryptSummary('conversation_memories',String(f.calls[1].args.p_summary),1),'사용자는 종이배 만들기를 좋아한다고 말했다.');assert.equal(JSON.parse(f.calls[1].args.p_embedding as string).length,1536);
});
test('worker: provider failure marks the lease failed without logging private data',async()=>{
 const f=fake({user_id:USER,messages:[{role:'user',content:'PRIVATE TEXT'}],context:[]});const logs:unknown[]=[];
 const res=await handleConversationWorker(req(),env,{client:f.client,metric:x=>logs.push(x),fetch:async()=>Response.json({error:'PRIVATE PROVIDER'}, {status:401})});
 assert.equal(res.status,503);assert.equal(f.calls[1].args.p_summary,null);
 assert.doesNotMatch(JSON.stringify(logs)+JSON.stringify(await res.json()),/PRIVATE|aaaa/);
});
test('worker: deleted/withdrawn lease is skipped after generation',async()=>{
 const f=fake({user_id:USER,messages:[{role:'user',content:'가상 문장'}],context:[]},false);
 const res=await handleConversationWorker(req(),env,{client:f.client,metric:()=>{},fetch:async(url)=>String(url).endsWith('/responses')?Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"summary":"가상 문장"}'}]}]}):Response.json({model:'text-embedding-3-large',data:[{embedding:Array.from({length:1536},(_,i)=>i?0:1)}]})});
 assert.deepEqual(await res.json(),{processed:false});
});

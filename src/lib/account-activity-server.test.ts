import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {refreshActivityDays} from './account-activity-server.ts';
import {testCipher} from './test-cipher.ts';
test('account report loads every raw page, deduplicated by DB IDs, and excludes profile names',async()=>{
 const cipher=testCipher();
 // 절반은 암호화 전 평문(버전 0), 절반은 암호문(버전 1): 둘 다 원문으로 세어야 한다
 const all=Array.from({length:1003},(_,i)=>{
  const id=String(i).padStart(5,'0');
  if(i%2) return {id,role:'user',content:'산책 호야 찬준',content_key_version:0,created_at:'2026-11-17T01:00:00Z'};
  const enc=cipher.encryptContent('산책 호야 찬준');
  return {id,role:'user',content:enc.content,content_key_version:enc.key_version,created_at:'2026-11-17T01:00:00Z'};
 });
 let writes=0;let queries=0;
 const fake={auth:{getUser:async()=>({data:{user:{user_metadata:{here_profile_v1:{profile:{companion:'호야',nickname:'찬준'}}}}}})},
  from:()=>{
   let cursor='';const q={select:()=>q,order:()=>q,limit:()=>q,gt:(_:string,id:string)=>{cursor=id;return q;},abortSignal:async()=>{queries++;return {data:all.filter(m=>m.id>cursor).slice(0,1000)};}};return q;
  },rpc:async(name:string,args:{p_days:{said:number;words:Record<string,number>}[]})=>{writes++;assert.equal(name,'sync_account_activity');assert.equal(args.p_days[0].said,1003);assert.deepEqual(args.p_days[0].words,{산책:1003});return {};},
 } as unknown as SupabaseClient;
 await refreshActivityDays(fake,cipher);assert.equal(queries,2);assert.equal(writes,1);
});

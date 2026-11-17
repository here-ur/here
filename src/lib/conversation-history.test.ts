import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoryBatch,mergeHistory,legacyHistoryBatches } from './conversation-history.ts';
import { summarizeConversation } from './conversation-memory.ts';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const message={id,role:'user' as const,content:'테스트',at:Date.now()};
test('대화 저장은 중복 ID·만료 원문·미래 시각·과한 내용을 거절한다',()=>{
 assert.equal(parseHistoryBatch({id,messages:[message]}).messages.length,1);
 for(const messages of [[message,message],[{...message,at:Date.now()-31*86400000}],[{...message,at:Date.now()+600000}],[{...message,content:'x'.repeat(8001)}],[{...message,role:'system'}]]) assert.throws(()=>parseHistoryBatch({id,messages}));
});
test('이전 페이지와 현재 메시지는 ID로 합치고 시각이 같아도 안정적으로 정렬한다',()=>{
 const newer={...message,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
 assert.deepEqual(mergeHistory([newer,message],[message]),[message,newer]);
});
test('전체 대화 요약은 두 화자를 유지하고 이전 문맥을 새 사실과 분리한다',async()=>{
 let payload={input:[] as {content:string}[],store:true,instructions:""};
 const result=await summarizeConversation([{role:'user',content:'그걸로 할게'},{role:'assistant',content:'토요일부터 해보자'}],{openaiKey:'test',summaryKey:'test',fetch:async(_url,init)=>{
  payload=JSON.parse(String(init?.body)); return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'사용자는 제안을 받아들였고 캐릭터가 토요일부터 시작하자고 제안했다.'})}]}]});
 }},AbortSignal.timeout(1000),[{role:'assistant',content:'산책하는 건 어때?'}]);
 assert.match(result,/캐릭터가/);const input=JSON.parse(payload.input[0].content);
 assert.equal(input.messages[1].role,'assistant');assert.equal(input.context.length,1);assert.equal(payload.store,false);
 assert.match(payload.instructions,/사용자의 실제 경험이나 확정 사실로 바꾸지 마/);
});

test('기존 로컬 기록 이관은 재실행해도 같은 ID이며 만료 기록을 제외한다',async()=>{
 const now=Date.now();const log=[{id:'old',startedAt:now-31*86400000,messages:[{role:'user' as const,content:'만료'}]},{id:'recent',startedAt:now-1000,messages:[{role:'user' as const,content:'가상 이야기'},{role:'assistant' as const,content:'가상 답변'}]}];
 const one=await legacyHistoryBatches(log,now);const two=await legacyHistoryBatches(log,now);
 assert.deepEqual(one,two);assert.equal(one[0].messages.length,2);assert.equal(parseHistoryBatch(one[0]).messages.length,2);
});

// The DB permits twelve 8k messages plus two preceding context messages.
test('최대 크기 대화 배치도 요약하고 문맥 개수 초과는 거절한다',async()=>{
 const messages=Array.from({length:12},()=>({role:'user' as const,content:'가'.repeat(8000)}));
 const context=messages.slice(0,2);let called=0;
 const config={openaiKey:'test',summaryKey:'test',fetch:async()=>{called++;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"summary":"가상 요약"}'}]}]});}};
 assert.equal(await summarizeConversation(messages,config,AbortSignal.timeout(1000),context),'가상 요약');
 await assert.rejects(summarizeConversation(messages,config,AbortSignal.timeout(1000),messages.slice(0,3)),/invalid_conversation/);
 assert.equal(called,1);
});

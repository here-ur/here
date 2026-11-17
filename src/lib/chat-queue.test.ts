import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatQueue, queuedChatContext } from './chat-queue.ts';
import type { HistoryMessage } from './conversation-history.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('연속 메시지를 한 번에 한 요청씩 처리하고 대기 메시지는 다음 턴으로 묶는다', async () => {
  const calls: string[][] = []; const waits: ReturnType<typeof deferred>[] = []; const states: boolean[] = [];
  const queue = new ChatQueue<string>({ run: async batch => { calls.push(batch); const wait=deferred();waits.push(wait);await wait.promise; }, state: busy=>states.push(busy), error:()=>assert.fail() });
  queue.enqueue('하나');queue.enqueue('둘');queue.enqueue('셋');
  assert.deepEqual(calls,[['하나']]);
  waits[0].resolve();await tick();assert.deepEqual(calls,[['하나'],['둘','셋']]);
  queue.enqueue('넷');waits[1].resolve();await tick();assert.deepEqual(calls.at(-1),['넷']);
  waits[2].resolve();await tick();assert.equal(states.at(-1),false);
});

test('실패해도 보낸 메시지와 대기 순서를 유지하고 명시적으로 재시도한다', async()=>{
  const calls: string[][]=[];const wait=deferred();let failure=false;
  const queue=new ChatQueue<string>({run:async batch=>{calls.push(batch);if(calls.length===1)await wait.promise;},state:(_,failed)=>{failure=failed;},error:()=>{}});
  queue.enqueue('첫 글');queue.enqueue('추가 글');wait.reject(new Error('offline'));await tick();
  assert.equal(calls.length,1);assert.equal(failure,true);
  queue.retry();await tick();assert.deepEqual(calls,[['첫 글'],['첫 글','추가 글']]);assert.equal(failure,false);
});

test('실패 후 새 메시지를 보내도 이전 메시지부터 다시 처리한다',async()=>{
  const calls:string[][]=[];const queue=new ChatQueue<string>({run:async batch=>{calls.push(batch);if(calls.length===1)throw Error('offline');},state:()=>{},error:()=>{}});
  queue.enqueue('첫 글');await tick();queue.enqueue('둘째 글');await tick();assert.deepEqual(calls,[['첫 글'],['첫 글','둘째 글']]);
});

test('취소하면 진행 요청을 중단하고 대기 메시지로 새 요청을 만들지 않는다',async()=>{
  const wait=deferred();let calls=0;let signal:AbortSignal|undefined;
  const queue=new ChatQueue<string>({run:async(_,s)=>{calls++;signal=s;await wait.promise;},state:()=>{},error:()=>assert.fail()});
  queue.enqueue('첫 글');queue.enqueue('둘째 글');queue.cancel();assert.equal(signal?.aborted,true);
  wait.resolve();await tick();queue.retry();queue.enqueue('셋째 글');assert.equal(calls,1);
});

test('대기 메시지가 많아도 정해진 묶음 크기 안에서 누락 없이 처리한다',async()=>{
  const first=deferred();const calls:number[][]=[];
  const queue=new ChatQueue<number>({run:async batch=>{calls.push(batch);if(calls.length===1)await first.promise;},state:()=>{},error:()=>assert.fail()},2);
  for(let i=0;i<6;i++)queue.enqueue(i);first.resolve();await tick();assert.deepEqual(calls,[[0],[1,2],[3,4],[5]]);
});

test('추가 메시지는 이전 답변 다음에 묶고 다음 묶음의 메시지는 제외한다',()=>{
  const msg=(id:string,role:'user'|'assistant',at:number):HistoryMessage=>({id,role,at,content:id});
  const a=msg('a','user',1),b=msg('b','user',2),c=msg('c','user',3),reply=msg('reply','assistant',4);
  assert.deepEqual(queuedChatContext([a,b,c,reply],[b]).map(m=>m.id),['a','reply','b']);
});

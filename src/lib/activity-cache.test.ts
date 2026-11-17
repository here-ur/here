import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeActivity} from './activity-cache.ts';
import {acknowledgeActivity} from './activity-outbox.ts';
import {summarizeDays} from './report.ts';
import {parseActivity} from './activity-types.ts';
const date=new Date().toISOString().slice(0,10);
const day={date,said:2,replies:1,hours:Array(24).fill(0),words:{산책:2},crisis:false};
test('in-flight acknowledgement preserves newer edits and cloud response cannot undo them',()=>{
 const old={id:'old',choice:{kind:'seed' as const,day:date,value:'walk',at:100}};
 const newer={id:'new',choice:{...old.choice,value:'song',at:200}};
 assert.deepEqual(acknowledgeActivity([old],[newer]),[newer]);
 const data={days:[day],choices:[old.choice,{kind:'mine' as const,day:date,value:'sunny',at:100}],practices:[{day:date,id:'water',action:'done' as const}]};
 const cache=materializeActivity(data,[newer,{id:'clear',choice:{kind:'mine',day:date,value:null,at:200}},{id:'done',practice:{day:date,id:'walk',action:'done'}}],[{...day,mine:'rain'}]);
 assert.equal(cache.seeds[date],'song');assert.equal(cache.days[0].mine,undefined);
 assert.deepEqual(cache.practice.done[date],['water','walk']);
});
test('server statistics group Korean midnight and include more than one UI page',()=>{
 const sessions=[{id:'x',startedAt:0,messages:Array.from({length:65},()=>({role:'user' as const,content:'산책 좋아',at:Date.parse('2026-11-16T15:30:00Z')}))}];
 const days=summarizeDays(sessions,[],'Asia/Seoul');assert.equal(days[0].date,'2026-11-17');assert.equal(days[0].hours[0],65);assert.equal(days[0].said,65);
});
test('invalid activity shape rejected before database writes',()=>{
 assert.throws(()=>parseActivity({days:[],choices:[{kind:'seed',day:'oops',at:0,value:'song'}],practices:[]}));
 assert.throws(()=>parseActivity({days:[{...day,hours:[]}],choices:[],practices:[]}));
});

test('offline outbox is scoped to the account and retains explicit clears',async()=>{
 const {setLocalOwner}=await import('./local-scope.ts');
 const {queueActivityChoice,readActivityOutbox}=await import('./activity-outbox.ts');
 const storage=new Map<string,string>();
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)}});
 try {
  setLocalOwner('a');queueActivityChoice('mine',date,'sunny');queueActivityChoice('mine',date,null);
  assert.equal(readActivityOutbox().length,1);assert.equal(readActivityOutbox()[0].choice?.value,null);
  setLocalOwner('b');assert.equal(readActivityOutbox().length,0);queueActivityChoice('seed',date,'walk');
  setLocalOwner('a');assert.equal(readActivityOutbox()[0].choice?.kind,'mine');
 } finally {setLocalOwner(null);if(previous) Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});

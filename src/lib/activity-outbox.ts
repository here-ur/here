import type { DayStat } from "./report.ts";
import { accountKey } from './local-scope.ts';
import type { ActivityChoice, ActivityPractice } from './activity-types.ts';
export const ACTIVITY_CHANGED='here:activity-changed';
export const ACTIVITY_STORAGE_ERROR='here:activity-storage-error';
export const ACTIVITY_PENDING='here:activity-pending';
export type ActivityMutation = {id:string; choice?:ActivityChoice; practice?:ActivityPractice; day?:DayStat};
const KEY='here.activity-outbox.v1';
export function readActivityOutbox(key=accountKey(KEY)): ActivityMutation[] {
 if(!key) return [];
 try {const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[];} catch {return [];}
}
export function writeActivityOutbox(items:ActivityMutation[],key=accountKey(KEY)) {
 if(!key) return;
 localStorage.setItem(key,JSON.stringify(items));
}
function queueActivityChoiceUnsafe(kind:ActivityChoice['kind'],day:string,value:ActivityChoice['value']) {
 const key=accountKey(KEY); if(!key) return;
 const queue=readActivityOutbox(key);
 const at=Math.max(Date.now(),...queue.flatMap(m=>m.choice?[m.choice.at+1]:[]));
 const next=queue.filter(m=>!m.choice || m.choice.kind!==kind || m.choice.day!==day);
 next.push({id:crypto.randomUUID(),choice:{kind,day,value,at}});
 writeActivityOutbox(next,key); notifyActivity(ACTIVITY_PENDING);
}
function queueActivityPracticeUnsafe(practice:ActivityPractice) {
 const key=accountKey(KEY); if(!key) return;
 const queue=readActivityOutbox(key);
 if(queue.some(m=>m.practice?.day===practice.day&&m.practice.id===practice.id&&m.practice.action===practice.action)) return;
 writeActivityOutbox([...queue,{id:crypto.randomUUID(),practice}],key);notifyActivity(ACTIVITY_PENDING);
}
export function notifyActivity(event=ACTIVITY_CHANGED) {
 if(typeof window!=='undefined') window.dispatchEvent(new Event(event));
}
/** Remove only acknowledged IDs: edits made while a request was in flight must survive. */
export function acknowledgeActivity(sent:ActivityMutation[],current:ActivityMutation[]) {
 const ids=new Set(sent.map(m=>m.id));return current.filter(m=>!ids.has(m.id));
}

function queueActivityDayUnsafe(day:DayStat) {
 const key=accountKey(KEY);if(!key) return;
 const queue=readActivityOutbox(key).filter(m=>m.day?.date!==day.date);
 writeActivityOutbox([...queue,{id:crypto.randomUUID(),day}],key);notifyActivity(ACTIVITY_PENDING);
}

// A full/blocked browser store must not break the screen or discard changes silently.
function persistOrWarn(write:()=>void) {
 try {write();} catch {notifyActivity(ACTIVITY_STORAGE_ERROR);}
}
export function queueActivityChoice(kind:ActivityChoice['kind'],day:string,value:ActivityChoice['value']) {
 persistOrWarn(()=>queueActivityChoiceUnsafe(kind,day,value));
}
export function queueActivityPractice(practice:ActivityPractice) {
 persistOrWarn(()=>queueActivityPracticeUnsafe(practice));
}
export function queueActivityDay(day:DayStat) {
 persistOrWarn(()=>queueActivityDayUnsafe(day));
}

import { loadReport, loadSkyChoice, mergeDays } from './report.ts';
import { loadSeeds } from './garden.ts';
import { loadPractice, type PracticeLog } from './practice.ts';
import { accountKey } from './local-scope.ts';
import { notifyActivity, type ActivityMutation } from './activity-outbox.ts';
import { emptyActivity, type ActivityChoice, type ActivityData } from './activity-types.ts';
export function legacyActivity():ActivityData {
 const data=emptyActivity(); data.days=loadReport();
 const choice=(kind:ActivityChoice['kind'],day:string,value:ActivityChoice['value'])=>data.choices.push({kind,day,value,at:0});
 for(const day of data.days) for(const kind of ['mine','ai','tried'] as const) if(day[kind]!==undefined) choice(kind,day.date,day[kind]!);
 for(const [day,seed] of Object.entries(loadSeeds())) choice('seed',day,seed);
 const sky=loadSkyChoice();if(sky) choice('sky','1970-01-01',sky);
 const practices=loadPractice();
 for(const action of ['done','later','closed'] as const) for(const [day,ids] of Object.entries(practices[action])) for(const id of ids) data.practices.push({day,id,action});
 return data;
}
/** Pending local edits overlay a response that may have started before those edits. */
export function materializeActivity(data:ActivityData,pending:ActivityMutation[],localDays=loadReport()) {
 const days=mergeDays(mergeDays(localDays,data.days),pending.flatMap(m=>m.day?[m.day]:[])).map(d=>{const copy={...d};delete copy.mine;delete copy.ai;delete copy.tried;return copy;});
 const byDay=new Map(days.map(d=>[d.date,d]));
 const choices=new Map(data.choices.map(c=>[c.kind+':'+c.day,c]));
 for(const m of pending) if(m.choice) {
  const c=m.choice,old=choices.get(c.kind+':'+c.day);
  if(!old || c.at>old.at) choices.set(c.kind+':'+c.day,c);
 }
 const seeds:Record<string,string>={};let sky:string|null=null;
 for(const c of choices.values()) {
  if(c.kind==='seed'&&typeof c.value==='string') seeds[c.day]=c.value;
  else if(c.kind==='sky') sky=c.value as string;
  else {
   const d=byDay.get(c.day);
   if(d && c.value!==null) Object.assign(d,{[c.kind]:c.value});
  }
 }
 const practice:PracticeLog={done:{},later:{},closed:{}};
 for(const p of [...data.practices,...pending.flatMap(m=>m.practice?[m.practice]:[])]) {
  const ids=practice[p.action][p.day]??=[];
  if(!ids.includes(p.id)) ids.push(p.id);
 }
 return {days,seeds,sky,practice};
}
export function cacheActivity(data:ActivityData,pending:ActivityMutation[]) {
 const cache=materializeActivity(data,pending);
 const set=(name:string,value:string)=>{const key=accountKey(name);if(!key) throw Error('account_changed');localStorage.setItem(key,value);};
 set('here.report.v1',JSON.stringify(cache.days));set('here.garden.v1',JSON.stringify(cache.seeds));set('here.practice.v1',JSON.stringify(cache.practice));
 if(cache.sky) set('here.report-sky.v1',cache.sky);
 else {const key=accountKey('here.report-sky.v1');if(key) localStorage.removeItem(key);}
 notifyActivity();
}

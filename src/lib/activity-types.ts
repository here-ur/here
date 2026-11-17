import { isDayStat, type DayStat } from './report.ts';
export type ActivityChoice = { kind: 'seed'|'mine'|'ai'|'tried'|'sky'; day: string; value: string|number|null; at: number };
export type ActivityPractice = { day: string; id: string; action: 'done'|'later'|'closed' };
export type ActivityData = { days: DayStat[]; choices: ActivityChoice[]; practices: ActivityPractice[] };
export const emptyActivity = (): ActivityData => ({days:[],choices:[],practices:[]});
export function parseActivity(value: unknown): ActivityData {
 if(!value || typeof value!=='object') throw Error('invalid_activity');
 const d=value as ActivityData;
 const date=(s:unknown)=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!Array.isArray(d.days)||d.days.length>366||!d.days.every(isDayStat)
  || !Array.isArray(d.choices)||d.choices.length>2000||!d.choices.every(c=>c && ['seed','mine','ai','tried','sky'].includes(c.kind)&&date(c.day)&&Number.isSafeInteger(c.at)&&c.at>=0&&(c.value===null||typeof c.value==='string'||typeof c.value==='number'))
  || !Array.isArray(d.practices)||d.practices.length>9000||!d.practices.every(p=>p&&date(p.day)&&typeof p.id==='string'&&p.id.length<30&&['done','later','closed'].includes(p.action))) throw Error('invalid_activity');
 return d;
}

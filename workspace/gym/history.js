export const STORAGE_KEY='richard-gym-v1';
export const dayKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function dayNumber(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;const [y,m,d]=key.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?dt.getTime()/86400000:NaN;}
export function cleanHistory(value){
  const days={};for(const [key,n] of Object.entries(value?.days||{}))if(Number.isFinite(dayNumber(key))&&Number.isInteger(n)&&n>0&&n<=1000000)days[key]=n;
  const score=n=>Number.isInteger(n)&&n>=0&&n<1000000?n:0;
  return {version:1,days,bestBird:score(value?.bestBird),bestDemo:score(value?.bestDemo)};
}
export function summary(data,date=new Date()){
  const today=dayKey(date),now=dayNumber(today),days=Object.keys(data.days).map(dayNumber).filter(n=>n<=now).sort((a,b)=>a-b),set=new Set(days);
  let best=0,run=0,last=-Infinity;for(const n of days){run=n===last+1?run+1:1;best=Math.max(best,run);last=n;}
  let current=0,n=set.has(now)?now:now-1;while(set.has(n--))current++;
  return {today:data.days[today]||0,current,best,total:Object.entries(data.days).filter(([d])=>dayNumber(d)<=now).reduce((sum,[,n])=>sum+n,0)};
}
export class WorkoutHistory {
  constructor(storage){this.storage=storage;this.data=cleanHistory(null);this.available=true;this.load();}
  load(){try{const raw=this.storage.getItem(STORAGE_KEY);this.data=cleanHistory(raw?JSON.parse(raw):null);}catch{this.available=false;}return this.data;}
  save(){try{this.storage.setItem(STORAGE_KEY,JSON.stringify(this.data));}catch{this.available=false;}}
  recordRep(date=new Date()){if(this.available)this.load();const key=dayKey(date);this.data.days[key]=Math.min(1000000,(this.data.days[key]||0)+1);this.save();}
  recordScore(score,demo=false){if(this.available)this.load();const key=demo?'bestDemo':'bestBird';this.data[key]=Math.max(this.data[key],Math.floor(score));this.save();}
  clear(){try{this.storage.removeItem(STORAGE_KEY);}catch{this.available=false;return false;}this.data=cleanHistory(null);return true;}
}

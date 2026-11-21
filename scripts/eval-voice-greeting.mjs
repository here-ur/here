// Opt-in, billable end-to-end test. Use a disposable synthetic account only.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv.includes('--live')) {
 console.log('No API calls made. Run with --live and GREETING_SESSION_FILE (synthetic Supabase session JSON).');
 process.exit(0);
}
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json');
const {createChunks,stringToBase64URL}=require('@supabase/ssr');
const fixture=JSON.parse(readFileSync(process.env.GREETING_SESSION_FILE||'.vercel/deployment-test-account.json','utf8'));
const target=process.env.GREETING_TARGET||'http://localhost:3000';
if (!fixture.session?.access_token || !/@example\.invalid$/.test(fixture.session?.user?.email||'')) throw Error('Use a disposable example.invalid test account, never a real user session.');
const origin=new URL(target);
if (!['localhost','127.0.0.1','here-dev.vercel.app'].includes(origin.hostname) && !/^here-[a-z0-9-]+-here23\.vercel\.app$/.test(origin.hostname)) throw Error('Only local or Here development/preview targets are allowed.');
const runs=Number(process.env.GREETING_RUNS||5),results=[];
const preconnectWaitMs=Number(process.env.GREETING_PRECONNECT_WAIT_MS||0);
const runIntervalMs=Number(process.env.GREETING_RUN_INTERVAL_MS||16000);
if(!Number.isFinite(runIntervalMs)||runIntervalMs<16000||runIntervalMs>60000)throw Error('GREETING_RUN_INTERVAL_MS must be 16000–60000 to respect the development account quota.');
if(!Number.isFinite(preconnectWaitMs)||preconnectWaitMs<0||preconnectWaitMs>10000)throw Error('GREETING_PRECONNECT_WAIT_MS must be 0–10000.');
if (!Number.isInteger(runs)||runs<1||runs>20) throw Error('GREETING_RUNS must be 1–20.');
const temporary=mkdtempSync(join(tmpdir(),'here-voice-eval-'));
// Ten seconds of digital silence, looped by Chrome. No real microphone is read.
const wav=Buffer.alloc(44+48000*10*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const silentMicrophone=join(temporary,'silent.wav');writeFileSync(silentMicrophone,wav);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${silentMicrophone}`]});
try {
 for(let i=0;i<runs;i++) {
  const runStarted=Date.now();
  const context=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844},storageState:process.env.GREETING_BROWSER_STATE});
  const cookies=createChunks('sb-mwjwfumpxdlllikcdvkh-auth-token','base64-'+stringToBase64URL(JSON.stringify(fixture.session)));
  await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:target,secure:target.startsWith('https:'),sameSite:'Lax'})));
  const page=await context.newPage();const api=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',async r=>{if(r.url().endsWith('/api/live')){const record={status:r.status(),timing:r.headers()['server-timing']};api.push(record);try{const body=await r.json();if(r.ok())Object.assign(record,{model:body.model,voice:body.voice,memory:body.memory});else record.code=body.code;}catch{}}});
  await page.addInitScript(()=>{
   window.__greeting={started:null,elapsed:null,stages:[],transcript:'',userSpeech:false,earlySpeech:false,earlyMicrophone:false,connectionReady:false,readyBeforeClick:false};
   const originalMic=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=(...args)=>{if(window.__greeting.started===null)window.__greeting.earlyMicrophone=true;return originalMic(...args);};
   document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(b?.getAttribute('aria-label')?.includes('음성 대화 시작')){window.__greeting.started=e.timeStamp;window.__greeting.readyBeforeClick=window.__greeting.connectionReady;}},true);
   const original=console.info.bind(console);console.info=(...args)=>{try{const m=JSON.parse(args[0]);if(m.event==='here_voice_timing'){window.__greeting.stages.push(m);if(m.stage==='first_audio'&&window.__greeting.started!==null)window.__greeting.elapsed=performance.now()-window.__greeting.started;}}catch{} original(...args);};
   const originalChannel=RTCPeerConnection.prototype.createDataChannel;
   RTCPeerConnection.prototype.createDataChannel=function(...args){window.__voicePeer=this;const ch=originalChannel.apply(this,args);ch.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='session.started')window.__greeting.connectionReady=true;if(m.type==='session.output_transcript.delta'){window.__greeting.transcript+=m.delta;if(window.__greeting.started===null)window.__greeting.earlySpeech=true;}if(m.type==='session.input_transcript.delta'&&m.delta?.trim())window.__greeting.userSpeech=true;}catch{}});return ch;};
  });
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/음성 대화 시작/}).waitFor({timeout:30000});
  if(preconnectWaitMs)await page.waitForTimeout(preconnectWaitMs);
  await page.getByRole('button',{name:/음성 대화 시작/}).click();
  try {await page.waitForFunction(()=>window.__greeting.elapsed!==null,{},{timeout:18000});}catch{}
  await page.waitForTimeout(1400);
  const data=await page.evaluate(async()=>{
   const stats=await window.__voicePeer?.getStats();
   const transport=[];
   stats?.forEach(s=>{
    if(s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated){const remote=stats.get(s.remoteCandidateId);transport.push({type:'candidate-pair',rttMs:s.currentRoundTripTime*1000,serverAddress:remote?.address,serverProtocol:remote?.protocol});}
    if(s.type==='inbound-rtp'&&s.kind==='audio')transport.push({type:'inbound-audio',jitterMs:s.jitter*1000,averageJitterBufferMs:s.jitterBufferEmittedCount?s.jitterBufferDelay/s.jitterBufferEmittedCount*1000:null,packetsLost:s.packetsLost});
    if(s.type==='transport')transport.push({type:'transport',dtlsCipher:s.dtlsCipher});
   });
   return {...window.__greeting,transport};
  });
  const measured=data.stages.find(s=>s.stage==='first_audio')?.elapsedMs;
  const elapsed=data.elapsed===null||!Number.isFinite(measured)?null:Math.max(data.elapsed,measured);
  const passed=elapsed!==null&&elapsed<=2000&&!data.userSpeech&&!data.earlySpeech&&!data.earlyMicrophone&&/안녕|반가|왔|만나/.test(data.transcript)&&api.length===1&&api[0].status===200&&api[0].model==='gpt-live-1'&&api[0].voice==='noeul'&&api[0].memory===true&&errors.length===0;
  const result={run:i+1,passed,elapsedMs:elapsed,budgetMs:2000,preconnectWaitMs,readyBeforeClick:data.readyBeforeClick,earlySpeech:data.earlySpeech,earlyMicrophone:data.earlyMicrophone,userSpeech:data.userSpeech,transcript:data.transcript,stages:data.stages,transport:data.transport,api:api.map(x=>({...x})),errors:[...errors]};results.push(result);console.log(JSON.stringify(result));
  // Enter text for cleanup: ending voice onto home would create another paid standby.
  const text=page.getByRole('button',{name:'글로 이야기하기'});if(await text.isEnabled())await text.click();await page.waitForTimeout(500);await context.close();
  if(i+1<runs)await new Promise(resolve=>setTimeout(resolve,Math.max(0,runIntervalMs-(Date.now()-runStarted))));
 }
}finally{await browser.close();rmSync(temporary,{recursive:true,force:true});}
const report={target,budgetMs:2000,preconnectWaitMs,runIntervalMs,runs,passed:results.every(r=>r.passed),results};
if(process.env.GREETING_RESULT)writeFileSync(process.env.GREETING_RESULT,JSON.stringify(report,null,2));
console.log(JSON.stringify({summary:true,runs,passed:report.passed}));
if(results.some(r=>!r.passed))process.exitCode=1;

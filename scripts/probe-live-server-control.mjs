// Opt-in, billable probe. Synthetic digital silence; never uses a real microphone.
// LIVE_PROBE_ENV_FILE=/absolute/path/to/development.env node scripts/probe-live-server-control.mjs --live
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';

if (!process.argv.includes('--live')) {
  console.log('No API calls. Use --live to start a loopback-only server control probe.');
  process.exit(0);
}
if (process.env.LIVE_PROBE_ENV_FILE) process.loadEnvFile(process.env.LIVE_PROBE_ENV_FILE);
if (!process.env.OPENAI_API_KEY) throw Error('development_provider_key_required');
const port = 3003;
const overlap = process.argv.includes('--overlap');
const hosted = process.argv.includes('--hosted');
const key = process.env.OPENAI_API_KEY;
const report = { scenario: hosted ? 'hosted worker control; local observer is emergency cleanup only' : overlap ? 'overlapping sideband handoff and server-owned close; synthetic silence' : 'sideband handoff and server-owned close; synthetic silence', events: [], result: 'not_started' };
const log = (type, extra = {}) => {
  report.events.push({ type, at: new Date().toISOString(), ...extra });
  writeFileSync('/tmp/here-live-server-control-probe.json', JSON.stringify(report, null, 2), {mode:0o600});
  console.log(JSON.stringify({type,...extra}));
};
let sessionId, activeSocket, startAt, requested = false, created = false, completed = false;
const timers = [];
function closeFromServer() {
  if (completed || requested || activeSocket?.readyState !== WebSocket.OPEN) return;
  requested = true;
  log('server_close_sent', {elapsedMs: Date.now()-startAt});
  activeSocket.send(JSON.stringify({type:'session.close'}));
}
function startSchedule() {
  if (startAt) return;
  startAt=Date.now();
  log('server_observed_start');
  if (hosted) {
    timers.push(setTimeout(closeFromServer, process.argv.includes('--five-minutes') ? 330_000 : 100_000));
    return;
  }
  // Disconnect one observer completely, then attach another: primary audio stays alive.
  for (const [delay, number] of [[7000,2],[15000,3]]) timers.push(setTimeout(() => {
    if(completed)return;
    const previous = activeSocket;
    if (overlap) {
      void attach(number).then(() => {
        log('observer_overlap_ready', {observer:number});
        previous?.close();
        log('observer_released',{observer:number-1});
      }).catch(() => { activeSocket=previous; closeFromServer(); });
    } else {
      previous?.close();
      log('observer_released',{observer:number-1});
      timers.push(setTimeout(()=>{void attach(number).catch(()=>closeFromServer());},1000));
    }
  },delay));
  timers.push(setTimeout(closeFromServer,25000));
}
async function attach(number) {
  const ws = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`, {
    headers:{Authorization:`Bearer ${key}`}, handshakeTimeout:8000,
  });
  activeSocket=ws;
  ws.on('message',raw=>{
    let event;try{event=JSON.parse(raw.toString());}catch{return;}
    if(event.type==='session.started') startSchedule();
    if(event.type==='session.usage.updated') log('usage',{observer:number,seconds:event.usage?.seconds});
    if(event.type==='error') log('provider_event_error',{observer:number,code:event.error?.code});
    if(event.type==='session.closed') {
      completed=true;
      report.result=requested?'server_close_confirmed':hosted?'closed_without_local_request':'ended_before_server_close';
      log('session_closed',{observer:number,reason:event.reason,usageSeconds:event.usage?.seconds,elapsedMs:startAt?Date.now()-startAt:null});
      timers.forEach(clearTimeout);ws.close();
    }
  });
  ws.on('error',()=>log('observer_error',{observer:number}));
  ws.on('close',()=>log('observer_socket_closed',{observer:number}));
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  log('observer_attached',{observer:number});
}

const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>음성 서버 종료 검증</title>
<style>body{max-width:760px;margin:60px auto;font:16px system-ui;background:#faf9f6;color:#222}button{padding:12px 20px}pre{padding:20px;background:#eee;white-space:pre-wrap}</style>
<h1>음성 서버 종료 검증</h1><p>합성 무음만 전송해요. 실제 마이크·회원 대화는 사용하지 않아요.</p>
<p>감시 연결을 두 차례 교체한 뒤 서버가 종료해요. 브라우저는 종료 명령을 보내지 않아요.</p>
<button id="start">검증 시작</button><pre id="output">대기 중</pre><pre id="server">서버 기록 대기</pre>
<script>
const output=document.getElementById('output');const append=s=>output.textContent+='\\n'+s;
let peer,channel,ctx,osc,deadline;
document.getElementById('start').onclick=async()=>{
 document.getElementById('start').disabled=true;output.textContent='합성 무음 연결 준비';
 try {
  ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination();const gain=ctx.createGain();gain.gain.value=0;osc=ctx.createOscillator();osc.connect(gain).connect(dest);osc.start();
  peer=new RTCPeerConnection();dest.stream.getTracks().forEach(t=>peer.addTrack(t,dest.stream));channel=peer.createDataChannel('oai-events',{negotiated:true,id:4});
  channel.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(['session.started','session.closed','error'].includes(m.type))append(m.type+(m.reason?' '+m.reason:''));if(m.type==='session.closed'){clearTimeout(deadline);peer.close();osc.stop();ctx.close();}};
  await peer.setLocalDescription(await peer.createOffer());
  const res=await fetch('/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:peer.localDescription.sdp})});const body=await res.json();if(!res.ok)throw Error(body.error);
  await peer.setRemoteDescription({type:'answer',sdp:body.sdp});append('브라우저 연결 완료 — 종료는 서버가 담당');
  deadline=setTimeout(()=>{append('비상 정리: 서버 종료 미확인');peer.close();osc.stop();ctx.close();},60000);
 }catch(e){append('실패: '+e.message);peer?.close();osc?.stop();ctx?.close();}
};
setInterval(async()=>{try{document.getElementById('server').textContent=JSON.stringify(await(await fetch('/status')).json(),null,2)}catch{}},1000);
</script></html>`;
const server=createServer(async(req,res)=>{
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}
  if(req.method==='GET'&&req.url==='/status'){json(200,report);return;}
  if(req.method!=='POST'||req.url!=='/session'){json(404,{});return;}
  if(req.headers.origin!==`http://localhost:${port}`&&req.headers.origin!==`http://127.0.0.1:${port}`){json(403,{});return;}
  if(created){json(409,{error:'한 번만 실행하는 검증이에요.'});return;}
  created=true;
  try {
    let body='';for await(const chunk of req){body+=chunk;if(body.length>65536)throw Error('invalid_input');}
    const {sdp}=JSON.parse(body);if(typeof sdp!=='string'||!sdp.startsWith('v=0'))throw Error('invalid_input');
    const response=await fetch('https://api.openai.com/v1/live/sessions',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
      body:JSON.stringify({session:{model:'gpt-live-1',audio:{output:{voice:'noeul'}},store:false,delegation:{type:'client'},instructions:'This is a synthetic connection test. Remain silent. Do not speak.',input:[]},transport:{type:'webrtc',sdp,dcid:4}}),
    });
    if(!response.ok){
      const detail=await response.json().catch(()=>null);
      const label=[detail?.error?.code,detail?.error?.type,detail?.error?.message].join(' ');
      const failureKind=/insufficient_quota|billing|credits|balance|(?:spend|usage)_limit_exceeded/i.test(label)?'billing_quota'
        :/concurren|simultaneous/i.test(label)?'concurrency':/rate.?limit/i.test(label)?'rate_limit':'other';
      report.result='provider_blocked';
      log('create_failed',{status:response.status,failureKind});
      json(502,{error:'공급자 세션 생성 실패 ('+response.status+', '+failureKind+')'});return;
    }
    const result=await response.json();sessionId=result.session?.id;
    if(typeof sessionId!=='string'||typeof result.transport?.sdp!=='string')throw Error('invalid_provider_response');
    log('session_created');
    if(hosted)writeFileSync('/tmp/here-voice-hosted-session.json',JSON.stringify({sessionId}),{mode:0o600});
    await attach(1);
    json(200,{sdp:result.transport.sdp});
    // Failsafe independent of browser. Also handles absence of session.started replay.
    timers.push(setTimeout(()=>{if(!startAt)startSchedule();},2000));
    if(!hosted)timers.push(setTimeout(()=>{if(!completed)closeFromServer();},45000));
  }catch{report.result='probe_failed';log('probe_failed');closeFromServer();json(502,{error:'검증 연결 실패'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Probe: http://localhost:${port}`));
process.on('SIGINT',()=>{closeFromServer();timers.forEach(clearTimeout);setTimeout(()=>{activeSocket?.close();server.close();},2000);});

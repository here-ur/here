// Optional native WebRTC test peer: synthetic silence, no browser or device microphone.
// Requires @roamhq/wrtc installed separately. Does not run without --live.
import { createRequire } from 'node:module';
if (!process.argv.includes('--live')) {
  console.log('No network calls. Use --live with LIVE_PROBE_WRTC_PATH for the loopback test server.');
  process.exit(0);
}
if (!process.env.LIVE_PROBE_WRTC_PATH) throw Error('native_webrtc_dependency_required');
const require = createRequire(import.meta.url);
const { RTCPeerConnection, MediaStream, nonstandard: { RTCAudioSource } } = require(process.env.LIVE_PROBE_WRTC_PATH);
const peer = new RTCPeerConnection();
const source = new RTCAudioSource();
const track = source.createTrack();
peer.addTrack(track, new MediaStream([track]));
const channel = peer.createDataChannel('live-events', { negotiated: true, id: 4 });
const frames = setInterval(() => source.onData({ samples: new Int16Array(480), sampleRate: 48000 }), 10);
let finish;
const done = new Promise(resolve => { finish = resolve; });
const timeout = setTimeout(() => finish('emergency_cleanup_no_close_confirmation'), process.argv.includes('--five-minutes') ? 340_000 : process.argv.includes('--hosted') ? 110_000 : 60_000);
channel.onmessage = event => {
  let data; try { data = JSON.parse(event.data); } catch { return; }
  if (data.type === 'session.started') console.log(JSON.stringify({ type: 'peer_session_started' }));
  if (data.type === 'session.closed') { console.log(JSON.stringify({ type: 'peer_session_closed' })); finish('provider_closed'); }
  if (data.type === 'error') console.log(JSON.stringify({ type: 'peer_error' }));
};
try {
  await peer.setLocalDescription(await peer.createOffer());
  const response = await fetch('http://127.0.0.1:3003/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3003' },
    body: JSON.stringify({ sdp: peer.localDescription.sdp }), signal: AbortSignal.timeout(25_000),
  });
  const result = await response.json();
  if (!response.ok) { console.log(JSON.stringify({ type: 'probe_rejected', status: response.status })); finish('creation_failed'); }
  else { await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp }); }
  console.log(JSON.stringify({ result: await done }));
} catch {
  console.log(JSON.stringify({ result: 'probe_client_failed' }));
} finally {
  clearTimeout(timeout); clearInterval(frames);
  track.stop(); channel.close(); peer.close();
}
// Native WebRTC may retain background threads after all peers have closed.
setTimeout(() => process.exit(0), 250);

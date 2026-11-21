type PreparedTransport = {
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  sender: RTCRtpSender;
  claimed: boolean;
};
let prepared: PreparedTransport | undefined;

/** Initialize only the browser's WebRTC runtime. No microphone, SDP exchange,
 * remote connection, user context, model generation, or paid session. */
export function prewarmLiveTransport(): () => void {
  if (typeof RTCPeerConnection === 'undefined') return () => {};
  prepared?.channel.close(); prepared?.peer.close(); prepared = undefined;
  let peer: RTCPeerConnection | undefined;
  try {
    peer = new RTCPeerConnection();
    const channel = peer.createDataChannel('live-events', { negotiated: true, id: 4 });
    const sender = peer.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    const value: PreparedTransport = { peer, channel, sender, claimed: false };
    prepared = value;
    return () => {
      if (value.claimed) return; // The active call now owns cleanup.
      if (prepared === value) prepared = undefined;
      value.channel.close(); value.peer.close();
    };
  } catch { peer?.close(); return () => {}; }
}

export function takeLiveTransport(): PreparedTransport | undefined {
  const value = prepared;
  prepared = undefined;
  if (value) value.claimed = true;
  return value;
}

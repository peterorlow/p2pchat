// webrtc.js
// Sets up a direct WebRTC DataChannel between two browsers with zero signaling
// server: ICE candidates are gathered up front ("non-trickle") and bundled into
// the same code the user copies/shares, so no ongoing server connection is
// needed to exchange candidates. A public STUN server is used only to discover
// each device's reachable address for NAT traversal - it never sees app data.

const SecureRTC = (() => {

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const ICE_GATHER_TIMEOUT_MS = 6000;

  let pc = null;
  let channel = null;
  let onMessageCb = null;
  let onOpenCb = null;
  let onCloseCb = null;

  function waitForIceGathering(peerConnection) {
    if (peerConnection.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ICE_GATHER_TIMEOUT_MS);
      peerConnection.addEventListener('icegatheringstatechange', function check() {
        if (peerConnection.iceGatheringState === 'complete') {
          clearTimeout(timer);
          peerConnection.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      });
    });
  }

  function setupConnectionEvents() {
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        onCloseCb && onCloseCb(pc.connectionState);
      }
    });
  }

  function wireChannel() {
    channel.addEventListener('open', () => onOpenCb && onOpenCb());
    channel.addEventListener('close', () => onCloseCb && onCloseCb('closed'));
    channel.addEventListener('message', (e) => {
      try {
        onMessageCb && onMessageCb(JSON.parse(e.data));
      } catch (err) {
        console.error('Bad message payload', err);
      }
    });
  }

  // Caller side: create offer + data channel, wait for full ICE gathering,
  // then return a single portable code string.
  async function createOffer(publicKeyB64) {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    setupConnectionEvents();

    channel = pc.createDataChannel('chat', { ordered: true });
    wireChannel();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    return encodeCode({
      type: 'offer',
      sdp: pc.localDescription.sdp,
      pubkey: publicKeyB64,
    });
  }

  // Callee side: consume the offer code, create an answer, wait for ICE
  // gathering, return the reply code.
  async function createAnswer(offerCodeStr, publicKeyB64) {
    const offerData = decodeCode(offerCodeStr);
    if (offerData.type !== 'offer') throw new Error('That code is not a connection code.');

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    setupConnectionEvents();

    pc.addEventListener('datachannel', (e) => {
      channel = e.channel;
      wireChannel();
    });

    await pc.setRemoteDescription({ type: 'offer', sdp: offerData.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);

    const code = encodeCode({
      type: 'answer',
      sdp: pc.localDescription.sdp,
      pubkey: publicKeyB64,
    });

    return { code, peerPublicKey: offerData.pubkey };
  }

  // Caller side: consume the reply code to complete the handshake.
  async function completeConnection(answerCodeStr) {
    const answerData = decodeCode(answerCodeStr);
    if (answerData.type !== 'answer') throw new Error('That code is not a reply code.');
    await pc.setRemoteDescription({ type: 'answer', sdp: answerData.sdp });
    return answerData.pubkey;
  }

  function send(payload) {
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(payload));
    }
  }

  function close() {
    if (channel) channel.close();
    if (pc) pc.close();
    channel = null;
    pc = null;
  }

  function encodeCode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }

  function decodeCode(str) {
    return JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
  }

  return {
    createOffer,
    createAnswer,
    completeConnection,
    send,
    close,
    on(event, cb) {
      if (event === 'message') onMessageCb = cb;
      if (event === 'open') onOpenCb = cb;
      if (event === 'close') onCloseCb = cb;
    },
  };
})();

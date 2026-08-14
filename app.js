// app.js - UI orchestration

const $ = (id) => document.getElementById(id);

let myPublicKeyB64 = null;
let peerPublicKeyB64 = null;
let safetyFingerprint = null;
let scanTarget = null;      // which input field a QR scan should fill
let scanReturnScreen = null;
let mediaStream = null;
let scanning = false;

// ---------- Screen navigation ----------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.dataset.active = 'false');
  $(id).dataset.active = 'true';
}

document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.back));
});

// ---------- Status dot ----------

function setStatus(state) {
  // state: 'idle' | 'pending' | 'connected'
  const dot = $('statusDot');
  dot.className = 'dot' + (state === 'idle' ? '' : ' ' + state);
}

// ---------- Home screen ----------

$('btnStart').addEventListener('click', startOfferFlow);
$('btnJoin').addEventListener('click', () => showScreen('screen-join'));

// ---------- OFFER FLOW (Start a new chat) ----------

async function startOfferFlow() {
  showScreen('screen-offer');
  $('offerCodeWrap').hidden = true;
  $('offerStatus').textContent = 'Generating keys and connection code\u2026';
  setStatus('pending');

  await SecureCrypto.generateKeyPair();
  myPublicKeyB64 = await SecureCrypto.exportPublicKey();

  const code = await SecureRTC.createOffer(myPublicKeyB64);

  $('offerCode').value = code;
  $('offerCodeWrap').hidden = false;
  $('offerStatus').textContent = 'Send this code to the other phone.';

  SecureRTC.on('open', onConnected);
  SecureRTC.on('message', onMessage);
  SecureRTC.on('close', onDisconnected);
}

$('copyOffer').addEventListener('click', () => copyToClipboard($('offerCode').value, 'copyOffer'));
$('shareOffer').addEventListener('click', () => shareCode($('offerCode').value, 'Secure Link connection code'));
$('qrOffer').addEventListener('click', () => toggleQr('offerQrWrap', 'offerQr', $('offerCode').value));

$('scanAnswer').addEventListener('click', () => startScan('answerInput', 'screen-offer'));

$('btnCompleteOffer').addEventListener('click', async () => {
  const answerCode = $('answerInput').value.trim();
  if (!answerCode) { flashInvalid('answerInput'); return; }
  try {
    peerPublicKeyB64 = await SecureRTC.completeConnection(answerCode);
    safetyFingerprint = await SecureCrypto.deriveSharedKey(peerPublicKeyB64);
    $('offerStatus').textContent = 'Connecting\u2026';
  } catch (err) {
    console.error(err);
    alert('That reply code looks invalid or incomplete. Double check it was copied in full.');
  }
});

// ---------- JOIN FLOW ----------

$('scanOffer').addEventListener('click', () => startScan('offerInput', 'screen-join'));

$('btnGenerateAnswer').addEventListener('click', async () => {
  const offerCode = $('offerInput').value.trim();
  if (!offerCode) { flashInvalid('offerInput'); return; }

  $('answerCodeWrap').hidden = false;
  $('answerStatus').textContent = 'Generating keys and reply code\u2026';
  setStatus('pending');

  try {
    await SecureCrypto.generateKeyPair();
    myPublicKeyB64 = await SecureCrypto.exportPublicKey();

    const { code, peerPublicKey } = await SecureRTC.createAnswer(offerCode, myPublicKeyB64);
    peerPublicKeyB64 = peerPublicKey;
    safetyFingerprint = await SecureCrypto.deriveSharedKey(peerPublicKeyB64);

    $('answerCode').value = code;
    $('answerStatus').textContent = 'Send this reply back. Waiting for them to connect\u2026';

    SecureRTC.on('open', onConnected);
    SecureRTC.on('message', onMessage);
    SecureRTC.on('close', onDisconnected);
  } catch (err) {
    console.error(err);
    alert('That connection code looks invalid or incomplete. Double check it was copied in full.');
    $('answerCodeWrap').hidden = true;
    setStatus('idle');
  }
});

$('copyAnswer').addEventListener('click', () => copyToClipboard($('answerCode').value, 'copyAnswer'));
$('shareAnswer').addEventListener('click', () => shareCode($('answerCode').value, 'Secure Link reply code'));
$('qrAnswer').addEventListener('click', () => toggleQr('answerQrWrap', 'answerQr', $('answerCode').value));

// ---------- Connection lifecycle ----------

function onConnected() {
  setStatus('connected');
  showScreen('screen-chat');
  $('safetyNumber').textContent = safetyFingerprint;
  addSystemMessage('Connected \u2014 messages are end-to-end encrypted.');
}

function onDisconnected(state) {
  setStatus('idle');
  addSystemMessage(state === 'closed' ? 'Chat ended.' : 'Connection lost.');
}

$('leaveChat').addEventListener('click', () => {
  SecureRTC.close();
  setStatus('idle');
  $('messages').innerHTML = '';
  $('safetyPanel').hidden = true;
  resetFlowState();
  showScreen('screen-home');
});

function resetFlowState() {
  myPublicKeyB64 = null;
  peerPublicKeyB64 = null;
  safetyFingerprint = null;
  $('offerCode').value = '';
  $('answerCode').value = '';
  $('answerInput').value = '';
  $('offerInput').value = '';
  $('offerCodeWrap').hidden = true;
  $('answerCodeWrap').hidden = true;
}

// ---------- Chat ----------

$('verifyPill').addEventListener('click', () => {
  $('safetyPanel').hidden = !$('safetyPanel').hidden;
});

$('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const encrypted = await SecureCrypto.encryptMessage(text);
  SecureRTC.send(encrypted);
  addMessage(text, 'mine');
});

async function onMessage(payload) {
  try {
    const text = await SecureCrypto.decryptMessage(payload);
    addMessage(text, 'theirs');
  } catch (err) {
    console.error('Failed to decrypt incoming message', err);
    addSystemMessage('Received a message that could not be verified \u2014 discarded.');
  }
}

function addMessage(text, who) {
  const div = document.createElement('div');
  div.className = 'msg msg-' + who;
  div.textContent = text;
  $('messages').appendChild(div);
  $('messages').scrollTop = $('messages').scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-system';
  div.textContent = text;
  $('messages').appendChild(div);
  $('messages').scrollTop = $('messages').scrollHeight;
}

// ---------- Helpers: copy / share / QR ----------

async function copyToClipboard(text, btnId) {
  try {
    await navigator.clipboard.writeText(text);
    flashLabel(btnId, 'Copied');
  } catch {
    alert('Could not copy automatically \u2014 select and copy the code manually.');
  }
}

async function shareCode(text, title) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); } catch {}
  } else {
    copyToClipboard(text, null);
    alert('Sharing isn\u2019t available in this browser \u2014 code copied instead. Paste it into any messaging app.');
  }
}

function flashLabel(btnId, label) {
  if (!btnId) return;
  const btn = $(btnId);
  const original = btn.textContent;
  btn.textContent = label;
  setTimeout(() => { btn.textContent = original; }, 1200);
}

function flashInvalid(fieldId) {
  const el = $(fieldId);
  el.style.borderColor = 'var(--accent-red)';
  setTimeout(() => { el.style.borderColor = ''; }, 900);
}

let qrRendered = {};

function toggleQr(wrapId, targetId, text) {
  const wrap = $(wrapId);
  wrap.hidden = !wrap.hidden;
  if (!wrap.hidden && !qrRendered[targetId]) {
    $(targetId).innerHTML = '';
    new QRCode($(targetId), { text, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.L });
    qrRendered[targetId] = true;
  }
}

// ---------- QR Scanning ----------

async function startScan(targetFieldId, returnScreenId) {
  scanTarget = targetFieldId;
  scanReturnScreen = returnScreenId;
  showScreen('screen-scan');

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
  } catch (err) {
    alert('Camera access is needed to scan a QR code. You can paste the code manually instead.');
    showScreen(returnScreenId);
    return;
  }

  const video = $('scanVideo');
  video.srcObject = mediaStream;
  await video.play();

  scanning = true;
  scanLoop(video);
}

$('scanBack').addEventListener('click', stopScan);

function stopScan() {
  scanning = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  showScreen(scanReturnScreen || 'screen-home');
}

function scanLoop(video) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  function tick() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        $(scanTarget).value = code.data;
        scanning = false;
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
        showScreen(scanReturnScreen);
        return;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- Service worker (PWA install support) ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

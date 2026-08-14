// crypto.js
// App-layer end-to-end encryption, independent of WebRTC's built-in DTLS.
// Uses the browser's native Web Crypto API only - no external crypto library,
// no data ever leaves the device except the public key (which is meant to be public).

const SecureCrypto = (() => {

  let keyPair = null;        // { publicKey, privateKey } - ECDH P-256
  let sharedKey = null;      // derived AES-GCM key, set after connecting to peer

  function bufToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  function base64ToBuf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  async function generateKeyPair() {
    keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    return keyPair;
  }

  async function exportPublicKey() {
    const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    return bufToBase64(raw);
  }

  async function importPeerPublicKey(base64Key) {
    return crypto.subtle.importKey(
      'raw',
      base64ToBuf(base64Key),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
  }

  // Derives the shared AES-GCM key once we have the peer's public key.
  async function deriveSharedKey(peerPublicKeyB64) {
    const peerKey = await importPeerPublicKey(peerPublicKeyB64);
    sharedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: peerKey },
      keyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Fingerprint: SHA-256 over both raw public keys, sorted so both sides
    // compute the identical value regardless of who was caller/callee.
    const myRaw = bufToBase64(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const keys = [myRaw, peerPublicKeyB64].sort();
    const combined = new TextEncoder().encode(keys.join('|'));
    const digest = await crypto.subtle.digest('SHA-256', combined);
    return formatFingerprint(digest);
  }

  function formatFingerprint(digestBuf) {
    const bytes = new Uint8Array(digestBuf).slice(0, 15); // 15 bytes -> 5 groups of 5 digits
    const groups = [];
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) + (bytes[i + 1] << 8) + bytes[i + 2];
      groups.push(String(n % 100000).padStart(5, '0'));
    }
    return groups.join('  ');
  }

  async function encryptMessage(plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      sharedKey,
      new TextEncoder().encode(plaintext)
    );
    return { iv: bufToBase64(iv), ct: bufToBase64(ciphertext) };
  }

  async function decryptMessage({ iv, ct }) {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuf(iv) },
      sharedKey,
      base64ToBuf(ct)
    );
    return new TextDecoder().decode(plainBuf);
  }

  return {
    generateKeyPair,
    exportPublicKey,
    deriveSharedKey,
    encryptMessage,
    decryptMessage,
  };
})();

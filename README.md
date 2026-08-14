# Secure Link

A peer-to-peer encrypted chat between two phones. No account, no backend database,
no server that ever sees a message.

## How it actually works (read this before trusting it)

**Messages** travel directly between the two devices over a WebRTC DataChannel.
WebRTC encrypts that channel with DTLS by default, and this app adds a second,
independent layer on top: each device generates an ECDH (P-256) key pair, the
two public keys are exchanged during setup, and every message is encrypted with
AES-256-GCM using a key derived from that exchange. Even if somehow the DTLS
layer were compromised, messages are still unreadable without both devices'
private keys, which never leave the device.

**Connection setup** is the one part of "no server" that needs an asterisk, and
it's the same asterisk every serverless P2P app has (Signal calls, FaceTime,
etc.): to find each other across different networks, the two devices need to
exchange a one-time "connection code" (an SDP blob with ICE candidates already
gathered) and both need to reach a public STUN server
(`stun.l.google.com`) to learn their own reachable address. The STUN server
never sees your messages or even knows a chat exists — it just answers "what's
my public IP/port," the same way a phone directory tells you a number without
listening to the call.

**How you exchange the connection code is entirely up to you** — QR code, text
message, email, AirDrop, reading it out loud. The app doesn't send it anywhere
on its own.

**Safety number verification**: once connected, both phones show a 5-group
number derived from both public keys. Read it to each other (call, in person,
any channel) — if it matches on both screens, no one tampered with the codes
during exchange. This is the same idea as Signal's "safety numbers."

## Known limitations

- **Symmetric NAT**: on some networks (particularly restrictive corporate or
  carrier NAT), a direct connection can't be established with STUN alone and
  you'd need a TURN relay server. This app doesn't include one — direct P2P
  works for the large majority of home/mobile connections, but if a connection
  attempt just hangs, that's the likely reason. Anthropic can't run
  infrastructure like this for you, but you could add your own TURN server
  URL in `webrtc.js` (`ICE_SERVERS`) if this becomes an issue.
- **No message history / multi-device**: there's no server, so there's nothing
  to sync from. Closing both tabs ends the session; reconnecting means
  redoing the handshake.
- **Not audited**: this was written for you, not reviewed by a third-party
  cryptographer. Treat it as a solid, honest implementation of a well-known
  pattern — not as a substitute for Signal if you need a battle-tested tool.

## Running it

This is a static PWA — any static file host works. A few options:

**Quickest (local network testing):**
```bash
cd secure-p2p-chat
python3 -m http.server 8000
```
Then open `http://<your-computer's-LAN-IP>:8000` on both phones (same Wi-Fi).

**For real use across different networks**, it needs to be served over HTTPS
(browsers require this for camera access and WebRTC). Easiest free options:
- [GitHub Pages](https://pages.github.com/) — push this folder to a repo, enable Pages
- [Cloudflare Pages](https://pages.cloudflare.com/) — drag-and-drop deploy
- Your own server behind Cloudflare Tunnel, if you're already set up for that

Once hosted, open the URL on both phones. On iOS, use Share → "Add to Home
Screen"; on Android, Chrome will prompt to install. Either way it opens full-screen
like a native app.

## File structure

```
index.html    UI screens
style.css     Visual design
crypto.js     ECDH key exchange + AES-GCM message encryption (Web Crypto API)
webrtc.js     Peer connection + serverless offer/answer handshake
app.js        Screen navigation, QR generate/scan, wiring it together
manifest.json PWA install metadata
sw.js         Offline app-shell caching
```

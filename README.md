# BYTEVAULT · IMPOSTER FILES — REALTIME VERSION

This is a proper server-backed multiplayer build. It replaces the broken localStorage/PeerJS room logic with a Node + Socket.IO server.

## What is fixed
- Room codes are created and stored on the server.
- Players can join from completely different phones/laptops.
- Room capacity is 1–100, with no forced 6-player default.
- Only one admin session is allowed at a time.
- Admin key is checked on the server, not exposed in the browser code.
- Lobby updates live.
- Game start is synchronized.
- Roles are assigned server-side and remain hidden until reveal.
- Discussion messages are synchronized live.
- Voting is synchronized and private until reveal.
- Automatic reveal occurs when everyone has voted.
- Reconnect/disconnect behavior is much cleaner than the previous browser-only prototype.

## Local test
1. Install Node 20+.
2. Run `npm install`.
3. Set `ADMIN_KEY=Mysterygameadmin` (optional because this is the default).
4. Run `npm start`.
5. Open `http://localhost:10000` on the host machine.

## Deploy
Use a Render Web Service. This app requires a server/WebSocket connection, so it should not be deployed as a GitHub Pages-only static site.

Build command: `npm ci`
Start command: `npm start`
Environment variable: `ADMIN_KEY=Mysterygameadmin`

Render supports inbound WebSocket connections on Web Services. For an event, use a paid/non-sleeping instance if you need to avoid free-tier spin-up delays.

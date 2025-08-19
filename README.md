# Ai-Trsl — Realtime Translator Frontend (static)

This is a minimal Vite + React frontend prepared for GitHub Pages.
It includes a UI component for Daily (WebRTC) embedding, language selection,
consent controls and a WebSocket audio player. **Backend is required** for
Daily ephemeral tokens and streaming translated TTS audio.

## Quick start (local)
1. Install Node 18+.
2. `npm ci`
3. `npm run dev` — open http://localhost:5173

## Build
`npm run build` — output in `dist/`.

## Deploy to GitHub Pages
- Create a repo named `Ai-Trsl` (or edit `vite.config.js` base).
- Add repository secret `VITE_BACKEND_BASE` = `https://api.yourdomain.com`
- Push code to `main`. GitHub Actions (workflow) will build and publish to Pages.

## What you still need (backend)
- `/api/daily-token?roomId=...` — returns `{token, roomUrl, sessionId}`.
- `wss://.../ws/audio?sessionId=...` — stream binary audio blobs and JSON control messages.

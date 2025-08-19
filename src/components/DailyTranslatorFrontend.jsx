import React, { useEffect, useRef, useState } from "react";

const LANGS = [
  { code: "en", name: "English" },
  { code: "ru", name: "Русский" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
];

export default function DailyTranslatorFrontend({
  backendBase = "https://api.example.com",
  defaultRoom = "my-test-room",
}) {
  const [consented, setConsented] = useState(false);
  const [saveAudioOptIn, setSaveAudioOptIn] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [roomUrl, setRoomUrl] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState("idle");
  const [srcLang, setSrcLang] = useState("auto");
  const [tgtLang, setTgtLang] = useState("en");
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const playQueueRef = useRef([]);
  const playingRef = useRef(false);
  const [partials, setPartials] = useState([]);
  const [latencyMs, setLatencyMs] = useState(null);
  const [muted, setMuted] = useState(false);
  const [transcribeEnabled, setTranscribeEnabled] = useState(true);

  function ensureAudioCtx() {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      gainNodeRef.current = audioCtxRef.current.createGain();
      gainNodeRef.current.connect(audioCtxRef.current.destination);
      gainNodeRef.current.gain.value = muted ? 0 : 1;
    }
  }

  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = muted ? 0 : 1;
  }, [muted]);

  async function enqueueAndPlay(arrayBuffer) {
    ensureAudioCtx();
    const audioCtx = audioCtxRef.current;
    try {
      const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      playQueueRef.current.push(decoded);
      if (!playingRef.current) runPlayQueue();
    } catch (e) {
      const blob = new Blob([arrayBuffer], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.volume = muted ? 0 : 1;
      a.play().catch(err => console.warn("fallback play failed", err));
    }
  }

  async function runPlayQueue() {
    playingRef.current = true;
    const audioCtx = audioCtxRef.current;
    while (playQueueRef.current.length > 0) {
      const buf = playQueueRef.current.shift();
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(gainNodeRef.current);
      try {
        src.start();
        await new Promise(r => setTimeout(r, (buf.duration * 1000) + 20));
      } catch (e) { console.warn('start failed', e); }
    }
    playingRef.current = false;
  }

  function connectAudioWs(sid) {
    disconnectAudioWs();
    const wsUrl = backendBase.replace(/^http/, "ws") + `/ws/audio?sessionId=${encodeURIComponent(sid)}`;
    setStatus("ws-connecting");
    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WS open");
        setStatus("ws-open");
        sendControl({ type: 'settings', srcLang, tgtLang, transcribe: transcribeEnabled, saveAudio: saveAudioOptIn });
      };

      ws.onmessage = async (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const json = JSON.parse(ev.data);
            handleControlMessage(json);
            return;
          } catch (e) {}
        }
        if (ev.data instanceof ArrayBuffer || ev.data instanceof Blob) {
          const arrayBuffer = ev.data instanceof Blob ? await ev.data.arrayBuffer() : ev.data;
          await enqueueAndPlay(arrayBuffer);
        }
      };

      ws.onerror = (e) => { console.warn('WS error', e); setStatus('ws-error'); };
      ws.onclose = (evt) => { console.log('WS closed', evt); setStatus('ws-closed'); };
    } catch (e) {
      console.warn('failed(ws)', e);
      setStatus('ws-failed');
    }
  }

  function sendControl(obj) {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(obj));
      }
    } catch (e) { console.warn('send control failed', e); }
  }

  function handleControlMessage(json) {
    if (!json || !json.type) return;
    if (json.type === 'partial') {
      const when = json.serverTimestamp ? new Date(json.serverTimestamp) : new Date();
      setPartials(prev => [{ text: json.text, when, mode: 'partial' }, ...prev].slice(0, 20));
      if (json.serverTimestamp) {
        const now = Date.now();
        setLatencyMs(now - new Date(json.serverTimestamp).getTime());
      }
    }
    if (json.type === 'transcript') {
      const when = json.serverTimestamp ? new Date(json.serverTimestamp) : new Date();
      setPartials(prev => [{ text: json.text, when, mode: 'final' }, ...prev].slice(0, 50));
    }
    if (json.type === 'info') {
      setStatus(json.msg || 'info');
    }
  }

  async function joinRoom() {
    if (!consented) { alert('Подтвердите согласие перед подключением.'); return; }
    setJoining(true);
    setStatus('getting-token');
    try {
      const resp = await fetch(`${backendBase}/api/daily-token?roomId=${encodeURIComponent(defaultRoom)}`);
      if (!resp.ok) throw new Error('token fetch failed');
      const body = await resp.json();
      const sid = body.sessionId || (Math.random().toString(36).slice(2,9));
      setSessionId(sid);
      const token = body.token;
      const rUrl = body.roomUrl || body.room;
      const joinUrl = token ? (rUrl + `?t=${encodeURIComponent(token)}`) : rUrl;
      setRoomUrl(joinUrl);
      connectAudioWs(sid);
      setJoined(true);
      setStatus('joined');
    } catch (err) {
      console.error(err);
      setStatus('join-failed');
      alert('Не удалось получить токен комнаты. Проверьте backend.');
    } finally { setJoining(false); }
  }

  function leaveRoom() {
    setRoomUrl('');
    try { if (wsRef.current) wsRef.current.close(); } catch(e){}
    setJoined(false);
    setStatus('left');
  }

  function copySessionId() {
    if (!sessionId) return;
    navigator.clipboard.writeText(sessionId).then(() => {
      setStatus('session-copied');
      setTimeout(() => setStatus('joined'), 1500);
    });
  }

  return (
    <div style={{fontFamily:'Inter, system-ui, -apple-system, sans-serif', padding:20, color:'#fff', background:'#0b1220', minHeight:'100vh'}}>
      <div style={{maxWidth:1000, margin:'0 auto', background:'#0f1724', padding:20, borderRadius:12}}>
        <h1 style={{margin:0}}>Realtime Translator — Frontend</h1>
        <p style={{color:'#9aa4b2'}}>Consent, language pickers, join Daily iframe and play incoming TTS via WebSocket.</p>

        <div style={{display:'flex', gap:12, marginTop:12}}>
          <div>
            <label style={{fontSize:12,color:'#9aa4b2'}}>Source</label><br/>
            <select value={srcLang} onChange={e=>{setSrcLang(e.target.value); sendControl({type:'settings', srcLang:e.target.value});}} style={{padding:8,borderRadius:6,background:'#071123',color:'#fff'}}>
              <option value="auto">Auto-detect</option>
              {LANGS.map(l=> <option key={l.code} value={l.code}>{l.name} — {l.code}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:12,color:'#9aa4b2'}}>Target</label><br/>
            <select value={tgtLang} onChange={e=>{setTgtLang(e.target.value); sendControl({type:'settings', tgtLang:e.target.value});}} style={{padding:8,borderRadius:6,background:'#071123',color:'#fff'}}>
              {LANGS.map(l=> <option key={l.code} value={l.code}>{l.name} — {l.code}</option>)}
            </select>
          </div>

          <div style={{marginLeft:'auto'}}>
            <label style={{display:'block'}}><input type="checkbox" checked={consented} onChange={e=>setConsented(e.target.checked)} /> I consent</label>
            <label style={{display:'block'}}><input type="checkbox" checked={saveAudioOptIn} onChange={e=>{setSaveAudioOptIn(e.target.checked); sendControl({type:'settings', saveAudio: e.target.checked});}} /> Save audio</label>
          </div>
        </div>

        <div style={{marginTop:14, display:'flex', gap:8}}>
          <button onClick={()=>{ if (!joined) joinRoom(); else leaveRoom(); }} style={{padding:'8px 12px', background:'#10b981', color:'#042018', borderRadius:8}}>
            {joined ? 'Leave' : (joining ? 'Joining...' : 'Join room')}
          </button>
          <button onClick={copySessionId} style={{padding:'8px 12px', borderRadius:8}}>Copy sessionId</button>
          <button onClick={()=>setMuted(m=>!m)} style={{padding:'8px 12px', borderRadius:8}}>{muted ? 'Unmute' : 'Mute'}</button>
          <div style={{marginLeft:'auto', color:'#9aa4b2'}}>Status: <span style={{fontFamily:'monospace'}}>{status}</span></div>
        </div>

        <div style={{marginTop:12, borderRadius:8, overflow:'hidden', border:'1px solid #122033'}}>
          {roomUrl ? <iframe title="Daily room" src={roomUrl} allow="camera; microphone; autoplay; fullscreen" style={{width:'100%', height:420, border:0}} /> : <div style={{padding:40, color:'#9aa4b2'}}>Room iframe will appear here after Join.</div>}
        </div>

        <div style={{display:'flex', gap:12, marginTop:14}}>
          <div style={{flex:1, background:'#071220', padding:12, borderRadius:8}}>
            <div style={{fontSize:13, marginBottom:8}}>Live transcripts</div>
            <div style={{maxHeight:220, overflow:'auto'}}>
              {partials.length===0 ? <div style={{color:'#738296'}}>No transcripts yet</div> : partials.map((p,i)=>(<div key={i} style={{padding:8,borderRadius:6, background: p.mode==='final' ? '#0b2a1f' : '#081226', marginBottom:6}}><div style={{fontSize:11,color:'#7a8a99'}}>{p.when.toLocaleTimeString()}</div><div>{p.text}</div></div>))}
            </div>
          </div>

          <div style={{width:260, background:'#071220', padding:12, borderRadius:8}}>
            <div style={{fontSize:13}}>Playback queue</div>
            <div style={{color:'#7a8a99', marginTop:8}}>Queued audio segments: <strong>{playQueueRef.current.length}</strong></div>
            <div style={{fontSize:12, color:'#7a8a99', marginTop:8}}>Notes: Backend must stream TTS audio binary and JSON partials.</div>
          </div>
        </div>

      </div>
    </div>
  );
}

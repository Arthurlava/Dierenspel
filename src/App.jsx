// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getDatabase, ref, onValue, set, update, get, runTransaction,
  serverTimestamp, onDisconnect, remove
} from "firebase/database";

/* --------- Spel-constanten --------- */
const MAX_TIME_MS = 120000;
const MAX_POINTS = 200;
const DOUBLE_POF_BONUS = 100;
const JILLA_PENALTY = 25;
const COOLDOWN_MS = 5000;

const PID_KEY = "ppp.playerId";
const NAME_KEY = "ppp.playerName";
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/* --------- Firebase --------- */
/* (Laat zo als je nog geen ENV gebruikt) */
const firebaseConfig = {
  apiKey: "AIzaSyDuYvtJbjj0wQbSwIBtyHuPeF71poPIBUg",
  authDomain: "pimpampof-aec32.firebaseapp.com",
  databaseURL: "https://pimpampof-aec32-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pimpampof-aec32",
  storageBucket: "pimpampof-aec32.firebasestorage.app",
  messagingSenderId: "872484746189",
  appId: "1:872484746189:web:a76c7345c4f2ebb6790a84"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* --------- Helpers --------- */
function calcPoints(ms) { return Math.max(0, Math.floor(MAX_POINTS * (1 - ms / MAX_TIME_MS))); }
function makeRoomCode(len = 5) { let s = ""; for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
function getOrCreatePlayerId() {
  try { const x = localStorage.getItem(PID_KEY); if (x) return x; const id = crypto.randomUUID(); localStorage.setItem(PID_KEY, id); return id; }
  catch { return crypto.randomUUID(); }
}
function normalize(s) {
  return (s || "").toString().trim().toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function firstLetter(s) { const n = normalize(s).replace(/[^a-z0-9]/g, ""); return n.charAt(0) || ""; }
function lastLetter(s)  { const n = normalize(s).replace(/[^a-z0-9]/g, ""); return n.charAt(n.length - 1) || ""; }
function isDoublePof(word) { const a = firstLetter(word), b = lastLetter(word); return a && b && a === b; }
function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const on=()=>setOnline(true), off=()=>setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

/* --------- Kleine opmaak --------- */
const GlobalStyle = () => (
  <style>{`
    :root{
      --bg:#0f172a; --panel:#111827; --panel2:#0b1220; --text:#f8fafc;
      --muted:#94a3b8; --brand:#16a34a; --brand-2:#22c55e; --warn:#dc2626;
      --ring: 0 0 0 2px rgba(79, 70, 229, .3);
    }
    *{box-sizing:border-box}
    html,body,#root{height:100%}
    body{margin:0;background:linear-gradient(180deg,#0b1220,#0f172a);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
    .container{max-width:960px;margin:0 auto;padding:20px}
    .grid{display:grid;gap:16px}
    @media(min-width:768px){.grid-2{grid-template-columns:1fr 1fr}}
    .card{background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.3)}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .btn{padding:10px 14px;border:none;border-radius:12px;background:var(--brand);color:#041507;font-weight:800;cursor:pointer}
    .btn.alt{background:#0ea5e9;color:#001018}
    .btn.warn{background:var(--warn);color:#180404}
    .btn:disabled{opacity:.6;cursor:not-allowed}
    .input{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:var(--text);outline:none}
    .input:focus{box-shadow:var(--ring)}
    .badge{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);font-size:12px}
    .muted{color:var(--muted);font-size:12px}
    .headline{margin:0 0 6px 0;font-size:28px;font-weight:900;letter-spacing:.2px}
    .sub{margin:0 0 10px 0;color:var(--muted)}
    .letterWrap{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .letterBig{display:inline-grid;place-items:center;width:80px;height:80px;border-radius:20px;background:radial-gradient(circle at 30% 30%, var(--brand-2), var(--brand));color:#041507;font-size:32px;font-weight:900;border:1px solid rgba(0,0,0,.2);box-shadow:0 14px 40px rgba(34,197,94,.35)}
    @media(min-width:420px){.letterBig{width:96px;height:96px;font-size:40px}}
    .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:linear-gradient(90deg,var(--brand-2),var(--brand));color:#041507;padding:10px 14px;border-radius:999px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.35);z-index:10}
  `}</style>
);

/* ========================================================= */
export default function App() {
  const online = useOnline();
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [playerId] = useState(getOrCreatePlayerId);
  useEffect(() => { localStorage.setItem(NAME_KEY, playerName || ""); }, [playerName]);

  const [roomCode, setRoomCode] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const isOnlineRoom = !!roomCode;
  const isMyTurn = isOnlineRoom && room?.turn === playerId;

  const connIdRef = useRef(null);
  useEffect(() => {
    if (!roomCode) return;
    const connectedRef = ref(db, ".info/connected");
    const unsub = onValue(connectedRef, snap => {
      if (snap.val() === true) {
        const cid = crypto.randomUUID();
        connIdRef.current = cid;
        const myConn = ref(db, `rooms_animals/${roomCode}/presence/${playerId}/${cid}`);
        set(myConn, serverTimestamp());
        onDisconnect(myConn).remove();
      }
    });
    return () => {
      if (connIdRef.current) {
        remove(ref(db, `rooms_animals/${roomCode}/presence/${playerId}/${connIdRef.current}`)).catch(() => {});
        connIdRef.current = null;
      }
      unsub?.();
    };
  }, [roomCode, playerId]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  const [toast, setToast] = useState(null);
  const showToast = (txt, ms = 1500) => { setToast(txt); setTimeout(() => setToast(null), ms); };

  const [animalInput, setAnimalInput] = useState("");
  const [apiState, setApiState] = useState({ status: "idle", msg: "" });
  const inputRef = useRef(null);

  const inCooldown = room?.phase === "cooldown" && !room?.solo;
  const cooldownLeftMs = Math.max(0, (room?.cooldownEndAt || 0) - now);
  const answerElapsedMs = (!room?.solo && room?.phase === "answer" && room?.turnStartAt)
    ? Math.max(0, now - room.turnStartAt) : 0;
  const potentialPoints = !room?.solo ? calcPoints(answerElapsedMs) : 0;

  function attachRoom(code) {
    const r = ref(db, `rooms_animals/${code}`);
    onValue(r, (snap) => {
      const data = snap.val() || null;
      setRoom(data);
      setIsHost(!!data && data.hostId === playerId);
      if (!data || !data.players) return;
      if (!data.hostId || !data.players[data.hostId] || !data.turn || !data.players[data.turn]) {
        runTransaction(ref(db, `rooms_animals/${code}`), (d) => {
          if (!d || !d.players) return d;
          const ids = Object.keys(d.players);
          if (!d.hostId || !d.players[d.hostId]) d.hostId = ids[0];
          if (!d.turn || !d.players[d.turn]) d.turn = ids[0];
          if (!Array.isArray(d.playersOrder)) d.playersOrder = ids;
          return d;
        });
      }
    });
  }

  async function createRoom() {
    if (!online) { alert("Je bent offline."); return; }
    const code = makeRoomCode();
    const obj = {
      createdAt: serverTimestamp(),
      hostId: playerId,
      players: { [playerId]: { name: playerName || "Host", joinedAt: serverTimestamp() } },
      participants: { [playerId]: { name: playerName || "Host", firstJoinedAt: serverTimestamp() } },
      playersOrder: [playerId],
      turn: playerId,
      lastLetter: "?", started: false, solo: false,
      jail: {}, scores: {}, stats: {},
      phase: "answer", turnStartAt: null, cooldownEndAt: null, version: 2
    };
    await set(ref(db, `rooms_animals/${code}`), obj);
    setRoomCode(code); setIsHost(true); attachRoom(code);
  }
  async function joinRoom() {
    if (!online) { alert("Je bent offline."); return; }
    const code = (roomCodeInput || "").trim().toUpperCase();
    if (!code) { alert("Voer een room code in."); return; }
    const r = ref(db, `rooms_animals/${code}`);
    const s = await get(r); if (!s.exists()) { alert("Room niet gevonden."); return; }
    await runTransaction(r, (d) => {
      if (!d) return d;
      d.players ??= {}; d.players[playerId] = { name: playerName || "Speler", joinedAt: serverTimestamp() };
      d.participants ??= {};
      d.participants[playerId] = d.participants[playerId] || { name: playerName || "Speler", firstJoinedAt: serverTimestamp() };
      d.participants[playerId].name = playerName || d.participants[playerId].name;
      d.playersOrder ??= []; if (!d.playersOrder.includes(playerId)) d.playersOrder.push(playerId);
      d.jail ??= {}; d.scores ??= {}; d.stats ??= {};
      d.phase ??= "answer";
      if (!d.turn || !d.players[d.turn]) d.turn = d.playersOrder[0];
      if (!d.hostId || !d.players[d.hostId]) d.hostId = d.playersOrder[0];
      if (!d.turnStartAt && !d.solo && d.started) d.turnStartAt = Date.now();
      return d;
    });
    setRoomCode(code); setIsHost(false); attachRoom(code);
  }
  async function leaveRoom() {
    if (!roomCode) return;
    await runTransaction(ref(db, `rooms_animals/${roomCode}`), (d) => {
      if (!d) return d;
      if (d.players && d.players[playerId]) delete d.players[playerId];
      if (d.jail && d.jail[playerId] != null) delete d.jail[playerId];
      if (Array.isArray(d.playersOrder)) d.playersOrder = d.playersOrder.filter(id => id !== playerId && d.players && d.players[id]);
      const ids = d.players ? Object.keys(d.players) : []; if (ids.length === 0) return null;
      if (!d.hostId || !d.players[d.hostId]) d.hostId = d.playersOrder?.[0] || ids[0];
      if (!d.turn  || !d.players[d.turn])  d.turn  = d.playersOrder?.[0] || d.hostId || ids[0];
      return d;
    });
    if (connIdRef.current) {
      remove(ref(db, `rooms_animals/${roomCode}/presence/${playerId}/${connIdRef.current}`)).catch(() => {});
      connIdRef.current = null;
    }
    setRoomCode(""); setRoom(null); setIsHost(false);
  }
  async function startGame() {
    if (!room || !isHost) return;
    await update(ref(db, `rooms_animals/${roomCode}`), {
      started: true, lastLetter: "?", phase: "answer",
      turn: room.playersOrder?.[0] || room.hostId,
      turnStartAt: Date.now(), cooldownEndAt: null
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function advanceTurnWithJail(d) {
    const ids = (Array.isArray(d.playersOrder) ? d.playersOrder : Object.keys(d.players || {}))
      .filter((id) => d.players && d.players[id]);
    if (ids.length === 0) return null;
    d.jail ??= {};
    let idx = Math.max(0, ids.indexOf(d.turn));
    for (let i = 0; i < ids.length; i++) {
      idx = (idx + 1) % ids.length;
      const cand = ids[idx];
      const j = d.jail[cand] || 0;
      if (j > 0) { d.jail[cand] = j - 1; continue; }
      d.turn = cand; return cand;
    }
    d.turn = ids[(ids.indexOf(d.turn) + 1) % ids.length]; return d.turn;
  }
  useEffect(() => {
    if (!roomCode || !room) return;
    if (room.solo) return;
    if (room.phase === "cooldown" && room.cooldownEndAt && now >= room.cooldownEndAt) {
      runTransaction(ref(db, `rooms_animals/${roomCode}`), (d) => {
        if (!d || d.solo) return d;
        if (d.phase !== "cooldown") return d;
        if (!d.cooldownEndAt || Date.now() < d.cooldownEndAt) return d;
        d.phase = "answer"; d.turnStartAt = Date.now(); return d;
      });
    }
  }, [roomCode, room?.phase, room?.cooldownEndAt, now, room]);

  async function submitAnimal() {
    if (!room || !room.started) return;
    const raw = animalInput.trim(); if (!raw) return;

    const req = (room.lastLetter && room.lastLetter !== "?") ? room.lastLetter : null;
    const beginsOk = !req || firstLetter(raw) === req;

    const isMP = !!room && !room.solo;
    const elapsed = Math.max(0, Date.now() - (room?.turnStartAt ?? Date.now()));
    const basePoints = isMP ? calcPoints(elapsed) : 0;
    const double = isDoublePof(raw);
    const bonus = isMP && double ? DOUBLE_POF_BONUS : 0;
    const totalGain = beginsOk ? (basePoints + bonus) : 0;
    const nextLast = lastLetter(raw) || "?";

    const r = ref(db, `rooms_animals/${roomCode}`);
    await runTransaction(r, (d) => {
      if (!d) return d;
      if (!d.players || !d.players[d.turn]) return d;
      if (d.turn !== playerId) return d;
      if (d.phase !== "answer") return d;

      if (isMP) {
        d.scores ??= {}; d.stats ??= {};
        if (beginsOk) d.scores[playerId] = (d.scores[playerId] || 0) + totalGain;
        const s = d.stats[playerId] || { totalTimeMs: 0, answeredCount: 0, jillaCount: 0, doubleCount: 0 };
        s.totalTimeMs += elapsed; if (beginsOk) s.answeredCount += 1; if (double && beginsOk) s.doubleCount += 1;
        d.stats[playerId] = s;
      }

      d.lastLetter = nextLast;
      advanceTurnWithJail(d);

      if (isMP) { d.phase = "cooldown"; d.cooldownEndAt = Date.now() + COOLDOWN_MS; d.turnStartAt = null; }
      else { d.phase = "answer"; d.cooldownEndAt = null; d.turnStartAt = null; }
      return d;
    });

    if (isMP && totalGain > 0 && beginsOk) {
      showToast(`+${totalGain} punten${double ? ` (incl. +${DOUBLE_POF_BONUS} Dubble pof)` : ""}`, 1600);
    }
    if (!beginsOk) showToast("⚠️ Verkeerde beginletter — geen punten");
    setAnimalInput("");
  }

  async function useJilla() {
    if (!room) return;
    const isMP = !!room && !room.solo;
    const r = ref(db, `rooms_animals/${roomCode}`);
    await runTransaction(r, (d) => {
      if (!d) return d;
      if (!d.players || !d.players[d.turn]) return d;
      if (d.turn !== playerId) return d;
      if (d.phase !== "answer") return d;

      d.jail ??= {}; d.jail[playerId] = (d.jail[playerId] || 0) + 1;
      if (isMP) {
        d.scores ??= {}; d.stats ??= {};
        d.scores[playerId] = (d.scores[playerId] || 0) - JILLA_PENALTY;
        const s = d.stats[playerId] || { totalTimeMs: 0, answeredCount: 0, jillaCount: 0, doubleCount: 0 };
        s.jillaCount += 1; d.stats[playerId] = s;
        d.phase = "cooldown"; d.cooldownEndAt = Date.now() + COOLDOWN_MS; d.turnStartAt = null;
      } else { d.phase = "answer"; d.cooldownEndAt = null; d.turnStartAt = null; }

      advanceTurnWithJail(d); return d;
    });
    if (isMP) showToast(`-${JILLA_PENALTY} punten (Jilla)`);
  }

  // API: check dier via serverless
  async function checkAnimalViaAPI() {
    const q = animalInput.trim();
    if (!q) return setApiState({ status: "idle", msg: "" });
    try {
      setApiState({ status: "checking", msg: "Bezig met controleren…" });
      const r = await fetch(`/api/check-animal?name=${encodeURIComponent(q)}`);
      const json = await r.json();
      if (!json.ok) return setApiState({ status: "error", msg: "API-fout" });
      if (json.found) setApiState({ status: "ok", msg: `✅ Gevonden: ${json.scientificName ?? q} (confidence ${json.confidence ?? 0})` });
      else setApiState({ status: "notfound", msg: "ℹ️ Niet gevonden in database" });
    } catch { setApiState({ status: "error", msg: "Netwerkfout" }); }
  }

  const myJail = isOnlineRoom && room?.jail ? (room.jail[playerId] || 0) : 0;
  const canType = isMyTurn && myJail === 0 && !inCooldown && room?.started;

  useEffect(() => { if (canType) setTimeout(() => inputRef.current?.focus(), 0); }, [canType]);

  /* -------------------- UI -------------------- */
  return (
    <>
      <GlobalStyle />
      <div className="container grid">
        {/* Header */}
        <div className="card">
          <h1 className="headline">PimPamPof — Dierenspel</h1>
          <p className="sub">Typ een dier. Het moet beginnen met de <b>vereiste beginletter</b>. De <b>volgende beginletter</b> wordt de <b>laatste letter</b> van jouw woord.</p>
          <div className="row">
            {!room?.started && (
              <input className="input" placeholder="Jouw naam" value={playerName} onChange={e => setPlayerName(e.target.value)} />
            )}
            {!isOnlineRoom && (
              <>
                <button className="btn alt" onClick={createRoom} disabled={!online}>Room aanmaken</button>
                <input className="input" placeholder="Room code" value={roomCodeInput} onChange={e => setRoomCodeInput(e.target.value.toUpperCase())} />
                <button className="btn alt" onClick={joinRoom} disabled={!online}>Join</button>
              </>
            )}
            {isOnlineRoom && (
              <>
                {!room?.started && isHost && <button className="btn" onClick={startGame}>Start spel</button>}
                {!room?.started && !isHost && <span className="badge">Wachten op host…</span>}
                {room?.started && <span className="badge">Multiplayer actief</span>}
                <button className="btn warn" onClick={leaveRoom}>Leave</button>
                {!room?.started && <span className="badge">Room: <b>{roomCode}</b></span>}
              </>
            )}
            {!online && !isOnlineRoom && <span className="badge">Offline: maak verbinding om te spelen</span>}
          </div>
        </div>

        {/* Play panel + Sidebar */}
        <div className="grid grid-2">
          {/* Speelveld */}
          <div className="card">
            <div className="letterWrap" style={{ marginBottom: 8 }}>
              <div className="letterBig">{room?.lastLetter ? room.lastLetter : "?"}</div>
              <div style={{ display:"grid", gap:6 }}>
                <div className="row">
                  <span className="badge">Vereiste beginletter: <b>{room?.lastLetter || "?"}</b></span>
                  {isOnlineRoom && !room?.solo && (
                    inCooldown
                      ? <span className="badge">⏳ Volgende ronde over {Math.ceil(cooldownLeftMs / 1000)}s</span>
                      : <>
                          <span className="badge">⏱️ Tijd: {Math.floor(answerElapsedMs / 1000)}s / {Math.floor(MAX_TIME_MS / 1000)}s</span>
                          <span className="badge">🏅 Nu waard: <b>{potentialPoints}</b></span>
                        </>
                  )}
                </div>
                {isOnlineRoom && room?.started && myJail > 0 && (
                  <span className="badge">🔒 Jilla actief — je wordt {myJail} beurt(en) overgeslagen</span>
                )}
              </div>
            </div>

            {isOnlineRoom && room?.started && (
              <>
                <div className="row" style={{ marginTop: 8 }}>
                  <input
                    ref={inputRef}
                    className="input"
                    style={{ flex: "1 1 240px" }}
                    placeholder={
                      !isMyTurn ? "Niet jouw beurt"
                        : myJail > 0 ? "Jilla actief — beurt wordt overgeslagen"
                        : inCooldown ? "Wachten…"
                        : "Typ een dier en druk Enter"
                    }
                    value={animalInput}
                    onChange={(e) => { setAnimalInput(e.target.value); setApiState({ status: "idle", msg: "" }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") submitAnimal(); }}
                    disabled={!canType}
                  />
                  <button className="btn alt" onClick={checkAnimalViaAPI} disabled={!animalInput.trim()}>Check dier (API)</button>
                  {isMyTurn && !inCooldown && <button className="btn alt" onClick={useJilla}>Jilla (skip)</button>}
                  <button className="btn" onClick={submitAnimal} disabled={!canType}>Indienen</button>
                </div>

                {/* API result */}
                {apiState.status !== "idle" && (
                  <div className="row" style={{ marginTop: 6 }}>
                    <span className="badge" style={{
                      background:
                        apiState.status === "ok" ? "rgba(34,197,94,.15)" :
                        apiState.status === "notfound" ? "rgba(234,179,8,.12)" :
                        apiState.status === "checking" ? "rgba(59,130,246,.12)" : "rgba(239,68,68,.12)",
                      borderColor:
                        apiState.status === "ok" ? "rgba(34,197,94,.35)" :
                        apiState.status === "notfound" ? "rgba(234,179,8,.35)" :
                        apiState.status === "checking" ? "rgba(59,130,246,.35)" : "rgba(239,68,68,.35)"
                    }}>
                      {apiState.msg}
                    </span>
                  </div>
                )}
              </>
            )}

            {!isOnlineRoom && (
              <p className="muted" style={{ marginTop: 4 }}>Maak een room of join om te spelen.</p>
            )}
          </div>

          {/* Spelers & scores */}
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Spelers</h3>
            {isOnlineRoom && room?.participants ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(Array.isArray(room.playersOrder) ? room.playersOrder : Object.keys(room.players || {}))
                  .filter(id => room.players && room.players[id])
                  .map((id, idx) => {
                    const pName = room.participants?.[id]?.name || room.players?.[id]?.name || "Speler";
                    const active = room.turn === id;
                    const jcount = (room.jail && room.jail[id]) || 0;
                    const score = (!room.solo && room.scores && room.scores[id]) || 0;
                    return (
                      <li key={id} style={{
                        display:"flex",justifyContent:"space-between",alignItems:"center",
                        padding:"10px 0",borderTop:"1px solid rgba(255,255,255,.1)"
                      }}>
                        <div>
                          {idx + 1}. {pName}{room?.hostId === id ? " (host)" : ""}{" "}
                          {active && <span className="badge">🟢 beurt</span>}{" "}
                          {jcount > 0 && <span className="badge">Jilla x{jcount}</span>}
                        </div>
                        {!room.solo && <div className="badge">Punten: <b>{score}</b></div>}
                      </li>
                    );
                  })}
              </ul>
            ) : <p className="muted">Nog geen spelers.</p>}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

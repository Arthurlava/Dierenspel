// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
    getDatabase, ref, onValue, set, update, get, runTransaction, serverTimestamp,
    onDisconnect, remove
} from "firebase/database";

/* =========================
   ENV + CONSTANTS
========================= */
const SITE_TITLE = "PimPamPof — Dierenspel";
const URL_PIMPAMPOF =
    (import.meta?.env?.VITE_PIMPAMPOF_URL || "").trim() || "https://www.pimpampof.nl/";

const MAX_TIME_MS = 120000;
const MAX_POINTS = 200;
const DOUBLE_POF_BONUS = 100;
const COOLDOWN_MS = 5000;

// Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDuYvtJbjj0wQbSwIBtyHuPeF71poPIBUg",
    authDomain: "pimpampof-aec32.firebaseapp.com",
    databaseURL: "https://pimpampof-aec32-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "pimpampof-aec32",
    storageBucket: "pimpampof-aec32.firebasestorage.app",
    messagingSenderId: "872484746189",
    appId: "1:872484746189:web:a76c7345c4f2ebb6790a84"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

/* =========================
   STYLES
========================= */
const GlobalStyle = () => (
    <style>{`
  html, body, #root { height: 100%; }
  body {
    margin: 0;
    background: linear-gradient(180deg, #171717 0%, #262626 100%);
    color: #fff;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  }
  #root {
    width: min(100%, 720px);
    margin: 0 auto;
    padding: 24px 16px;
    box-sizing: border-box;
  }
  input, button, textarea { font-family: inherit; }
  .badge {
    display:inline-flex; align-items:center; gap:8px;
    padding:6px 10px; border-radius:999px;
    background: rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
    font-size: 12px;
  }
  .muted { color: rgba(255,255,255,0.7); font-size:12px; }

  @keyframes pofPop {
    0% { transform: scale(0.6); opacity: 0; }
    20% { transform: scale(1.12); opacity: 1; }
    50% { transform: scale(1.0); }
    100% { transform: scale(0.9); opacity: 0; }
  }
  .pof-toast { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index: 9999; }
  .pof-bubble {
    background: radial-gradient(circle at 30% 30%, rgba(34,197,94,0.96), rgba(16,185,129,0.92));
    padding: 18px 26px; border-radius: 999px; font-size: 28px; font-weight: 800;
    box-shadow: 0 12px 40px rgba(0,0,0,.35); animation: pofPop 1200ms ease-out forwards; letter-spacing: .5px;
  }

  @keyframes answerFlash {
    0% { transform: scale(.9); opacity: 0 }
    10% { transform: scale(1.04); opacity: 1 }
    90% { transform: scale(1.0); opacity: 1 }
    100% { transform: scale(.98); opacity: 0 }
  }
  .answer-flash { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index: 9996; }
  .answer-bubble {
    padding: 14px 18px; border-radius: 999px; font-weight:800; font-size: 20px;
    background: radial-gradient(circle at 30% 30%, rgba(34,197,94,.96), rgba(16,185,129,.92));
    color: #041507; box-shadow: 0 12px 40px rgba(0,0,0,.35); animation: answerFlash 900ms ease-out forwards;
    border: 1px solid rgba(255,255,255,.18);
  }

  @keyframes scoreToast {
    0% { transform: translateY(8px); opacity: 0; }
    15% { transform: translateY(0); opacity: 1; }
    85% { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(-6px); opacity: 0; }
  }
  .score-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 9998; pointer-events: none; animation: scoreToast 1400ms ease-out forwards; }
  .score-bubble { padding: 10px 14px; border-radius: 999px; font-weight: 800; box-shadow: 0 12px 28px rgba(0,0,0,.35); font-size: 16px; }
  .score-plus  { background: linear-gradient(90deg, #22c55e, #16a34a); color: #041507; }
  .score-minus { background: linear-gradient(90deg, #ef4444, #dc2626); color: #180404; }

  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index: 9995; }
  .card {
    width: min(92vw, 720px);
    background: #111;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 16px; padding: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.35);
  }
  .table { width:100%; border-collapse: collapse; }
  .table th, .table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.12); text-align: left; }
  .table th { font-weight: 700; }
  `}</style>
);

const styles = {
    wrap: { display: "flex", flexDirection: "column", gap: 20, textAlign: "center", alignItems: "center" },
    row: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "center" },
    section: {
        width: "100%", padding: 16, borderRadius: 16,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 22px rgba(0,0,0,0.3)", boxSizing: "border-box",
    },
    sectionTitle: { margin: "0 0 8px 0", fontSize: 18, fontWeight: 700 },
    btn: { padding: "10px 16px", borderRadius: 12, border: "none", background: "#16a34a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    btnAlt: { background: "#065f46" },
    input: { padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", minWidth: 240 },
    letterInput: { marginTop: 8, width: 260, textAlign: "center", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontSize: 16, boxSizing: "border-box" },
    list: { listStyle: "none", padding: 0, margin: 0 },
    li: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.1)" },
    liText: { lineHeight: 1.4, textAlign: "left" },
    foot: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
};

/* =========================
   HELPERS
========================= */
const PID_KEY = "dierenspel.playerId";
const NAME_KEY = "dierenspel.playerName";
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function makeRoomCode(len = 5) {
    let s = ""; for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
}
function getOrCreatePlayerId() {
    try {
        const existing = localStorage.getItem(PID_KEY);
        if (existing) return existing;
        const id = crypto.randomUUID();
        localStorage.setItem(PID_KEY, id);
        return id;
    } catch { return crypto.randomUUID(); }
}
function calcPoints(ms) {
    const p = Math.floor(MAX_POINTS * (1 - ms / MAX_TIME_MS));
    return Math.max(0, p);
}
function lastAlphaLetter(word) {
    const s = (word || "").toLowerCase().normalize("NFKD").replace(/[^\p{Letter}]/gu, "");
    if (!s) return "?";
    return s.at(-1).toUpperCase();
}
function isDoublePof(requiredLetter, word) {
    const s = (word || "").toUpperCase().replace(/[^A-ZÁÉÍÓÚÄËÏÖÜÇÑ]/g, "");
    const first = s[0] || "";
    return requiredLetter && requiredLetter !== "?" && first === requiredLetter;
}
function normalizeAnimalKey(w) {
    return (w || "").toLowerCase().normalize("NFKD").replace(/[^\p{Letter}0-9]/gu, "");
}
function useOnline() {
    const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
    useEffect(() => {
        const on = () => setOnline(true), off = () => setOnline(false);
        window.addEventListener("online", on); window.addEventListener("offline", off);
        return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    }, []);
    return online;
}

/* =========================
   SMALL UI
========================= */
function Section({ title, children }) {
    return (<div style={styles.section}>{title && <h2 style={styles.sectionTitle}>{title}</h2>}{children}</div>);
}

/* =========================
   COMPONENT
========================= */
export default function DierenspelApp() {
    const online = useOnline();

    const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) || "");
    useEffect(() => { localStorage.setItem(NAME_KEY, playerName || ""); }, [playerName]);
    const [playerId] = useState(() => getOrCreatePlayerId());

    // room state
    const [roomCodeInput, setRoomCodeInput] = useState("");
    const [roomCode, setRoomCode] = useState("");
    const [room, setRoom] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [answer, setAnswer] = useState("");
    const [now, setNow] = useState(() => Date.now());
    const [pofShow, setPofShow] = useState(false);
    const [pofText, setPofText] = useState("Dubble pof!");
    const [scoreToast, setScoreToast] = useState({ show: false, text: "", type: "plus" });

    // flash
    const [flash, setFlash] = useState(null);
    const flashedIdRef = useRef(null);

    const connIdRef = useRef(null);
    const inputRef = useRef(null);
    const roomRef = useRef(null);

    useEffect(() => { const id = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(id); }, []);

    const isOnlineRoom = !!roomCode;
    const isMyTurn = isOnlineRoom && room?.turn === playerId;
    const requiredLetter = (room?.lastLetter && room.lastLetter !== "?") ? room.lastLetter : null;
    const isMP = !!room && !room.solo;

    const usedKeysSet = useMemo(() => {
        const set = new Set();
        if (room?.answers) for (const a of room.answers) set.add(normalizeAnimalKey(a.answer));
        return set;
    }, [room?.answers]);

    function triggerPof(text = "Dubble pof!") { setPofText(text); setPofShow(true); setTimeout(() => setPofShow(false), 1200); }
    function triggerScoreToast(text, type = "plus") {
        setScoreToast({ show: true, text, type });
        setTimeout(() => setScoreToast(s => ({ ...s, show: false })), 1400);
    }

    /* ---------- presence ----------- */
    useEffect(() => {
        if (!roomCode) return;
        const connectedRef = ref(db, ".info/connected");
        const unsub = onValue(connectedRef, snap => {
            if (snap.val() === true) {
                const connId = crypto.randomUUID();
                connIdRef.current = connId;
                const myConnRef = ref(db, `rooms/${roomCode}/presence/${playerId}/${connId}`);
                set(myConnRef, serverTimestamp());
                onDisconnect(myConnRef).remove();
            }
        });
        return () => {
            if (connIdRef.current) {
                const myConnRef = ref(db, `rooms/${roomCode}/presence/${playerId}/${connIdRef.current}`);
                remove(myConnRef).catch(() => { });
                connIdRef.current = null;
            }
            if (unsub) unsub();
        };
    }, [roomCode, playerId]);

    /* ---------- listen room ----------- */
    function attachRoomListener(code) {
        if (roomRef.current) roomRef.current = null;
        const r = ref(db, `rooms/${code}`);
        roomRef.current = r;
        onValue(r, (snap) => {
            const data = snap.val() ?? null;
            setRoom(data);
            setIsHost(!!data && data.hostId === playerId);
        });
    }

    /* ---------- flash op nieuwe answers ----------- */
    useEffect(() => {
        if (!room?.answers || room.answers.length === 0) return;
        const last = room.answers[room.answers.length - 1];
        if (!last) return;
        if (last.id && flashedIdRef.current === last.id) return;
        if (last.pid === playerId) { flashedIdRef.current = last.id; return; }

        flashedIdRef.current = last.id;
        setFlash({ text: `${last.name}: ${last.answer}` });
        const t = setTimeout(() => setFlash(null), 900);
        return () => clearTimeout(t);
    }, [room?.answers, playerId]);

    /* ---------- actions ----------- */
    async function createRoom({ solo = false } = {}) {
        const code = makeRoomCode();
        const obj = {
            createdAt: serverTimestamp(),
            hostId: playerId,
            players: { [playerId]: { name: playerName || "Host", joinedAt: serverTimestamp() } },
            participants: { [playerId]: { name: playerName || "Host", firstJoinedAt: serverTimestamp() } },
            playersOrder: [playerId],
            solo,
            started: false,
            lastLetter: "?",
            turn: playerId,
            turnStartAt: solo ? null : Date.now(),
            cooldownEndAt: null,
            scores: {},
            stats: {},
            answers: [],
            used: {},
            phase: "answer",
            version: 1
        };
        await set(ref(db, `rooms/${code}`), obj);
        setIsHost(true);
        setRoomCode(code);
        attachRoomListener(code);
    }

    async function joinRoom() {
        const code = (roomCodeInput || "").trim().toUpperCase();
        if (!code) { alert("Voer een room code in."); return; }
        const r = ref(db, `rooms/${code}`);
        const snap = await get(r);
        if (!snap.exists()) { alert("Room niet gevonden."); return; }

        await runTransaction(r, (data) => {
            if (!data) return data;
            if (!data.players) data.players = {};
            data.players[playerId] = { name: playerName || "Speler", joinedAt: serverTimestamp() };

            if (!data.participants) data.participants = {};
            data.participants[playerId] = data.participants[playerId] || { name: playerName || "Speler", firstJoinedAt: serverTimestamp() };
            data.participants[playerId].name = playerName || data.participants[playerId].name;

            if (!data.playersOrder) data.playersOrder = [];
            if (!data.playersOrder.includes(playerId)) data.playersOrder.push(playerId);

            if (!data.scores) data.scores = {};
            if (!data.stats) data.stats = {};
            if (!data.answers) data.answers = [];
            if (!data.used) data.used = {};
            if (!data.lastLetter) data.lastLetter = "?";
            if (!data.phase) { data.phase = "answer"; data.turnStartAt = data.solo ? null : Date.now(); data.cooldownEndAt = null; }

            if (!data.turn || !data.players[data.turn]) data.turn = data.playersOrder[0] || playerId;
            if (!data.hostId || !data.players[data.hostId]) data.hostId = data.playersOrder[0] || playerId;

            return data;
        });

        setIsHost(false);
        setRoomCode(code);
        attachRoomListener(code);
    }

    async function startGame() {
        if (!room || !isHost) return;
        await update(ref(db, `rooms/${roomCode}`), {
            started: true,
            lastLetter: "?",
            turn: room.playersOrder?.[0] || room.hostId,
            phase: "answer",
            turnStartAt: room.solo ? null : Date.now(),
            cooldownEndAt: null
        });
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    function advanceTurnWithJail(data) {
        const ids = (Array.isArray(data.playersOrder) ? data.playersOrder : Object.keys(data.players || {}))
            .filter((id) => data.players && data.players[id]);
        if (ids.length === 0) return null;

        let idx = Math.max(0, ids.indexOf(data.turn));
        idx = (idx + 1) % ids.length;
        data.turn = ids[idx];
        return data.turn;
    }

    async function submitAnswerOnline() {
        if (!room) return;
        const w = (answer || "").trim();
        if (!w) return;

        const key = normalizeAnimalKey(w);
        if (key && usedKeysSet.has(key)) {
            alert("Dit dier is al geweest in deze room.");
            return;
        }

        const elapsed = Math.max(0, Date.now() - (room?.turnStartAt ?? Date.now()));
        const basePoints = isMP ? calcPoints(elapsed) : 0;
        const isDouble = isDoublePof(room?.lastLetter || "?", w);
        const bonus = isMP && isDouble ? DOUBLE_POF_BONUS : 0;
        const totalGain = isMP ? (basePoints + bonus) : 0;

        const letterToSet = lastAlphaLetter(w);
        const r = ref(db, `rooms/${roomCode}`);

        await runTransaction(r, (data) => {
            if (!data) return data;
            if (!data.players || !data.players[data.turn]) {
                const ids = data.players ? Object.keys(data.players) : [];
                if (ids.length === 0) return null;
                data.playersOrder = (Array.isArray(data.playersOrder) ? data.playersOrder : ids).filter(id => ids.includes(id));
                data.turn = data.playersOrder[0] || ids[0];
            }
            if (data.turn !== playerId) return data;
            if (data.phase !== "answer") return data;

            if (!data.solo) {
                if (!data.scores) data.scores = {};
                data.scores[playerId] = (data.scores[playerId] || 0) + totalGain;

                if (!data.stats) data.stats = {};
                const s = data.stats[playerId] || { totalTimeMs: 0, answeredCount: 0, jillaCount: 0, doubleCount: 0 };
                s.totalTimeMs += elapsed;
                s.answeredCount += 1;
                if (isDouble) s.doubleCount += 1;
                data.stats[playerId] = s;
            }

            if (!data.answers) data.answers = [];
            if (!data.used) data.used = {};
            const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
            data.answers.push({
                id,
                pid: playerId,
                name: (data.participants?.[playerId]?.name) || (data.players?.[playerId]?.name) || "Speler",
                answer: w,
                timeMs: elapsed,
                points: data.solo ? 0 : totalGain,
                double: !!isDouble,
                ts: Date.now()
            });
            if (key) data.used[key] = true;
            if (data.answers.length > 200) data.answers = data.answers.slice(-200);

            data.lastLetter = letterToSet || "?";
            advanceTurnWithJail(data);

            if (!data.solo) {
                data.phase = "cooldown";
                data.cooldownEndAt = Date.now() + COOLDOWN_MS;
                data.turnStartAt = null;
            } else {
                data.phase = "answer";
                data.turnStartAt = null;
                data.cooldownEndAt = null;
            }
            return data;
        });

        if (isDouble) triggerPof(`Dubble pof! +${DOUBLE_POF_BONUS}`);
        if (isMP && totalGain > 0) {
            setScoreToast({ show: true, text: `+${totalGain} punten${isDouble ? ` (incl. +${DOUBLE_POF_BONUS} bonus)` : ""}`, type: "plus" });
            setTimeout(() => setScoreToast(s => ({ ...s, show: false })), 1400);
        }

        setAnswer("");
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    async function leaveRoom() {
        if (!roomCode) { setRoom(null); setRoomCode(""); setIsHost(false); return; }
        const r = ref(db, `rooms/${roomCode}`);
        await runTransaction(r, (data) => {
            if (!data) return data;
            if (data.players && data.players[playerId]) delete data.players[playerId];
            if (Array.isArray(data.playersOrder)) data.playersOrder = data.playersOrder.filter(id => id !== playerId && data.players && data.players[id]);
            const ids = data.players ? Object.keys(data.players) : [];
            if (ids.length === 0) return null;
            if (!data.hostId || !data.players[data.hostId]) data.hostId = data.playersOrder?.[0] || ids[0];
            if (!data.turn || !data.players[data.turn] || data.turn === playerId) data.turn = data.playersOrder?.[0] || data.hostId || ids[0];
            return data;
        });

        if (connIdRef.current) {
            const myConnRef = ref(db, `rooms/${roomCode}/presence/${playerId}/${connIdRef.current}`);
            remove(myConnRef).catch(() => { });
            connIdRef.current = null;
        }
        setRoom(null); setRoomCode(""); setIsHost(false);
    }

    /* ---------- cooldown tick ---------- */
    const inCooldown = room?.phase === "cooldown" && !room?.solo;
    const cooldownLeftMs = Math.max(0, (room?.cooldownEndAt || 0) - now);
    useEffect(() => {
        if (!roomCode || !room) return;
        if (room.solo) return;
        if (room.phase === "cooldown" && room.cooldownEndAt && now >= room.cooldownEndAt) {
            runTransaction(ref(db, `rooms/${roomCode}`), (data) => {
                if (!data) return data;
                if (data.solo) return data;
                if (data.phase !== "cooldown") return data;
                if (!data.cooldownEndAt || Date.now() < data.cooldownEndAt) return data;
                data.phase = "answer";
                data.turnStartAt = Date.now();
                return data;
            });
        }
    }, [roomCode, room?.phase, room?.cooldownEndAt, now, room]);

    const answerElapsedMs = (!room?.solo && room?.phase === "answer" && room?.turnStartAt)
        ? Math.max(0, now - room.turnStartAt) : 0;
    const potentialPoints = !room?.solo ? calcPoints(answerElapsedMs) : 0;

    /* ---------- UI ---------- */
    return (
        <>
            <GlobalStyle />
            <div style={styles.wrap}>
                {/* ───── BEGIN: vervang je bestaande <header> door dit blok ───── */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h1 className="h1">{SITE_TITLE}</h1>
                    <p className="muted" style={{ marginTop: 0 }}>
                        Typ een dier. Het moet beginnen met de <b>vereiste beginletter</b>. De volgende beginletter
                        wordt de <b>laatste letter</b> van jouw woord.
                    </p>

                    <div className="row">
                        {/* Naamveld alleen tonen vóór start */}
                        {!room?.started && (
                            <input
                                className="input"
                                placeholder="Jouw naam"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                            />
                        )}

                        {/* Niet in een room → maak/join */}
                        {!isOnlineRoom ? (
                            <>
                                <button className="btn" onClick={() => createRoom({ solo: false })} disabled={!online}>
                                    Room aanmaken
                                </button>

                                <input
                                    className="input"
                                    placeholder="Room code"
                                    value={roomCodeInput}
                                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                                />

                                <button className="btn alt" onClick={joinRoom} disabled={!online}>
                                    Join
                                </button>
                            </>
                        ) : (
                            <>
                                {/* In room */}
                                {!room?.started && isHost && (
                                    <button className="btn" onClick={startGame}>
                                        Start spel
                                    </button>
                                )}

                                {!room?.started && !isHost && <span className="badge">Wachten op host…</span>}
                                {room?.started && <span className="badge">Multiplayer actief</span>}

                                <button className="btn warn" onClick={leaveRoom}>
                                    Leave
                                </button>

                                {!room?.started && <span className="badge">Room: <b>{roomCode}</b></span>}
                            </>
                        )}

                        {/* Offline melding wanneer nog niet gejoined */}
                        {!online && !isOnlineRoom && (
                            <span className="badge">Offline: maak verbinding om te spelen</span>
                        )}
                    </div>
                </div>
                {/* ───── EINDE: header blok ───── */}


                {/* SPEELVELD */}
                {isOnlineRoom && room?.started && (
                    <Section>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                            <div className="badge">Room: <b>{roomCode}</b></div>

                            <div style={{ fontSize: 18 }}>
                                Vereiste letter:{" "}
                                <span style={{ fontWeight: 800 }}>
                                    {room?.lastLetter ?? "?"}
                                </span>
                            </div>

                            {!room.solo && (
                                <>
                                    {inCooldown ? (
                                        <div className="badge">⏳ Volgende ronde over {Math.ceil(cooldownLeftMs / 1000)}s</div>
                                    ) : (
                                        <div className="row">
                                            <span className="badge">⏱️ Tijd: {Math.floor(answerElapsedMs / 1000)}s / {Math.floor(MAX_TIME_MS / 1000)}s</span>
                                            <span className="badge">🏅 Punten nu: <b>{potentialPoints}</b></span>
                                        </div>
                                    )}
                                </>
                            )}

                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="text"
                                value={answer}
                                onChange={e => setAnswer(e.target.value)}
                                placeholder={
                                    !isMyTurn
                                        ? "Niet jouw beurt"
                                        : (inCooldown ? "Wachten… ronde start zo" : "Typ je dier en druk Enter")
                                }
                                disabled={!isMyTurn || inCooldown}
                                style={{ ...styles.letterInput, opacity: (isMyTurn && !inCooldown) ? 1 : 0.5 }}
                                onKeyDown={e => { if (e.key === "Enter") submitAnswerOnline(); }}
                            />

                            <div className="muted">
                                {requiredLetter ? `Tip: extra punten als je begint met "${requiredLetter}"` : "Eerste speler bepaalt de eerste ketting-letter."}
                            </div>
                        </div>
                    </Section>
                )}

                {/* SPELERS */}
                {isOnlineRoom && room?.participants && (
                    <Section title="Spelers">
                        <ul style={styles.list}>
                            {(Array.isArray(room.playersOrder) ? room.playersOrder : Object.keys(room.players || {}))
                                .filter((id) => !!(room.players && room.players[id]))
                                .map((id, idx) => {
                                    const pName = (room.participants?.[id]?.name) || (room.players?.[id]?.name) || "Speler";
                                    const active = room.turn === id;
                                    const score = (!room.solo && room.scores && room.scores[id]) || 0;
                                    return (
                                        <li
                                            key={id}
                                            style={{
                                                ...styles.li,
                                                ...(active ? { background: "rgba(22,163,74,0.18)" } : {})
                                            }}
                                        >
                                            <div style={styles.liText}>
                                                {idx + 1}. {pName}{room?.hostId === id ? " (host)" : ""}{" "}
                                                {!room.solo && <> <span style={{ margin: "0 6px" }} /> <span className="badge">Punten: <b>{score}</b></span></>}
                                            </div>
                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                {active ? <div>🟢 beurt</div> : <div style={{ opacity: 0.6 }}>—</div>}
                                            </div>
                                        </li>
                                    );
                                })}
                        </ul>
                    </Section>
                )}

                {/* GESCHIEDENIS */}
                {isOnlineRoom && room?.answers && room.answers.length > 0 && (
                    <Section title="Antwoorden">
                        <ul style={styles.list}>
                            {[...room.answers].slice().reverse().map((a) => (
                                <li key={a.id} style={styles.li}>
                                    <div style={styles.liText}>
                                        <b>{a.name}</b> → <b>{a.answer}</b>
                                        {" "}<span className="badge">⏱ {a.timeMs}ms</span>
                                        {" "}{!room.solo && <span className="badge">🏅 {a.points >= 0 ? `+${a.points}` : a.points}</span>}
                                        {" "}{a.double && <span className="badge">💥 Dubble pof</span>}
                                    </div>
                                    <div className="muted">{new Date(a.ts).toLocaleTimeString()}</div>
                                </li>
                            ))}
                        </ul>
                    </Section>
                )}

                <footer style={styles.foot}>
                    {isOnlineRoom
                        ? (room?.solo ? "Solo modus (geen punten)." : "Multiplayer: timer & punten actief (5s cooldown).")
                        : "Maak een room of join er één."}
                </footer>
            </div>

            {/* Dubble pof! overlay */}
            {pofShow && (
                <div className="pof-toast">
                    <div className="pof-bubble">{pofText}</div>
                </div>
            )}

            {/* Score delta toast */}
            {scoreToast.show && (
                <div className="score-toast">
                    <div className={`score-bubble ${scoreToast.type === "minus" ? "score-minus" : "score-plus"}`}>
                        {scoreToast.text}
                    </div>
                </div>
            )}

            {/* Groen answer flash */}
            {flash && (
                <div className="answer-flash">
                    <div className="answer-bubble">{flash.text}</div>
                </div>
            )}
        </>
    );
}

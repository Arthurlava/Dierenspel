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
const SITE_TITLE = "Dierenspel";

const MAX_TIME_MS = 120000;
const MAX_POINTS = 200;
const DOUBLE_POF_BONUS = 100;
const JILLA_PENALTY = 25;
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
  .h1 { margin:0 0 6px 0; font-size:28px; font-weight:900; }
  .card {
    width: min(92vw, 720px);
    background: #111;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 16px; padding: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.35);
  }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; justify-content:center; }
  .input {
    padding:10px 12px; border-radius:12px;
    border:1px solid rgba(255,255,255,.15);
    background:rgba(255,255,255,.06); color:#fff; outline:none;
  }
  .center { display:flex; justify-content:center; }
  .letterBig{
    display:grid; place-items:center; width:120px; height:120px; border-radius:28px;
    background:radial-gradient(circle at 30% 30%, #22c55e, #16a34a);
    color:#041507; font-size:56px; font-weight:900;
    border:1px solid rgba(0,0,0,.2); box-shadow:0 14px 40px rgba(34,197,94,.35);
    margin:8px auto 12px;
  }

  /* ==== GROENE KNOPPEN ==== */
  .btn{
    padding:10px 14px; border:none; border-radius:12px;
    background:#16a34a; color:#fff; font-weight:800; cursor:pointer;
  }
  .btn.alt{ background:#065f46; color:#eafff6 }
  .btn.warn{ background:#dc2626; color:#fff }
  .btn:disabled{ opacity:.6; cursor:not-allowed }

  /* toasts/flash */
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
  .dialog{width:min(92vw, 720px);background:#0f172a;border:1px solid #1f2937;border-radius:16px;padding:16px;box-shadow:0 24px 70px rgba(0,0,0,.55)}
  .table { width:100%; border-collapse: collapse; }
  .table th, .table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.12); text-align: left; }
  .table th { font-weight: 700; }
  `}</style>
);

const styles = {
    wrap: { display: "flex", flexDirection: "column", gap: 20, textAlign: "center", alignItems: "center" },
    section: {
        width: "100%", padding: 16, borderRadius: 16,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 22px rgba(0,0,0,0.3)", boxSizing: "border-box",
    },
    sectionTitle: { margin: "0 0 8px 0", fontSize: 18, fontWeight: 700 },
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
function firstAlphaLetter(word) {
    const s = (word || "").toLowerCase().normalize("NFKD").replace(/[^\p{Letter}]/gu, "");
    if (!s) return "";
    return s[0].toUpperCase();
}
function isDoublePof(requiredLetter, word) {
    const s = (word || "").toUpperCase().normalize("NFKD").replace(/[^\p{Letter}]/gu, "");
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
function Button({ children, variant, className = "", ...props }) {
    const base = variant === "alt" ? "btn alt" : variant === "warn" ? "btn warn" : "btn";
    return (
        <button className={`${base}${className ? ` ${className}` : ""}`} {...props}>
            {children}
        </button>
    );
}

/* =========================
   COMPONENT
========================= */
export default function DierenspelApp() {
    const online = useOnline();
    useEffect(() => { document.title = SITE_TITLE; }, []);

    const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) || "");
    useEffect(() => { localStorage.setItem(NAME_KEY, playerName || ""); }, [playerName]);
    const [playerId] = useState(() => getOrCreatePlayerId());

    // room state
    const [roomCodeInput, setRoomCodeInput] = useState("");
    const [roomCode, setRoomCode] = useState("");
    const [room, setRoom] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [answer, setAnswer] = useState("");
    const [apiState, setApiState] = useState({ status: "idle", msg: "" });

    // timers/toasts
    const [now, setNow] = useState(() => Date.now());
    const [pofShow, setPofShow] = useState(false);
    const [pofText, setPofText] = useState("Dubble pof!");
    const [scoreToast, setScoreToast] = useState({ show: false, text: "", type: "plus" });
    const [flash, setFlash] = useState(null);
    const flashedIdRef = useRef(null);

    // leaderboard
    const [leaderOpen, setLeaderOpen] = useState(false);
    const [leaderData, setLeaderData] = useState(null);

    // refs
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
            turnStartAt: null,          // geen timer vóór start
            cooldownEndAt: null,
            paused: false,
            pausedAt: null,
            jail: {},                   // Jilla
            scores: {},
            stats: {},
            answers: [],
            used: {},
            phase: "answer",
            version: 3
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
            data.players ??= {};
            data.players[playerId] = { name: playerName || "Speler", joinedAt: serverTimestamp() };

            data.participants ??= {};
            data.participants[playerId] = data.participants[playerId] || { name: playerName || "Speler", firstJoinedAt: serverTimestamp() };
            data.participants[playerId].name = playerName || data.participants[playerId].name;

            data.playersOrder ??= [];
            if (!data.playersOrder.includes(playerId)) data.playersOrder.push(playerId);

            data.scores ??= {};
            data.stats ??= {};
            data.answers ??= [];
            data.used ??= {};
            data.jail ??= {};
            data.lastLetter ??= "?";
            data.paused ??= false;
            data.pausedAt ??= null;

            if (!data.phase) data.phase = "answer";
            if (!data.started) { data.turnStartAt = null; data.cooldownEndAt = null; }

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
            turnStartAt: room.solo ? null : Date.now(),  // start nu pas
            cooldownEndAt: null
        });
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    function advanceTurn(data) {
        const ids = (Array.isArray(data.playersOrder) ? data.playersOrder : Object.keys(data.players || {}))
            .filter((id) => data.players && data.players[id]);
        if (ids.length === 0) return null;

        // sla spelers met jail > 0 over en decrement jail
        let idx = Math.max(0, ids.indexOf(data.turn));
        for (let i = 0; i < ids.length; i++) {
            idx = (idx + 1) % ids.length;
            const cand = ids[idx];
            data.jail ??= {};
            const j = data.jail[cand] || 0;
            if (j > 0) { data.jail[cand] = j - 1; continue; }
            data.turn = cand;
            return cand;
        }
        data.turn = ids[(ids.indexOf(data.turn) + 1) % ids.length];
        return data.turn;
    }

    async function submitAnswerOnline() {
        if (!room || !room.started) return;
        if (room.paused) return;

        const w = (answer || "").trim();
        if (!w) return;

        // --- CLIENT: strikte beginlettercontrole ---
        const req = (room.lastLetter && room.lastLetter !== "?") ? room.lastLetter : null;
        const firstClient = firstAlphaLetter(w);
        if (req && firstClient !== req) {
            // Korte duidelijke feedback
            setApiState({ status: "error", msg: `Moet beginnen met ${req}` });
            return;
        }

        const key = normalizeAnimalKey(w);
        if (key && usedKeysSet.has(key)) {
            alert("Dit dier is al geweest in deze room.");
            return;
        }

        // Tijd (bevroren wanneer gepauzeerd)
        const nowTs = Date.now();
        const effectiveNow = room.paused ? (room.pausedAt || nowTs) : nowTs;
        const startAt = room?.turnStartAt ?? effectiveNow;
        const elapsed = Math.max(0, effectiveNow - startAt);

        const basePoints = isMP ? calcPoints(elapsed) : 0;
        const isDouble = isDoublePof(room?.lastLetter || "?", w);
        const bonus = isMP && isDouble ? DOUBLE_POF_BONUS : 0;
        const totalGain = isMP ? (basePoints + bonus) : 0;

        const letterToSet = lastAlphaLetter(w);
        const r = ref(db, `rooms/${roomCode}`);

        await runTransaction(r, (data) => {
            if (!data) return data;
            if (!data.started) return data;
            if (data.paused) return data;

            if (!data.players || !data.players[data.turn]) {
                const ids = data.players ? Object.keys(data.players) : [];
                if (ids.length === 0) return null;
                data.playersOrder = (Array.isArray(data.playersOrder) ? data.playersOrder : ids).filter(id => ids.includes(id));
                data.turn = data.playersOrder[0] || ids[0];
            }
            if (data.turn !== playerId) return data;
            if (data.phase !== "answer") return data;

            // --- SERVER: strikte beginlettercontrole (anti-cheat) ---
            if (data.lastLetter && data.lastLetter !== "?") {
                const first = firstAlphaLetter(w);
                if (first !== data.lastLetter) return data;
            }

            // Duplicate guard
            data.used ??= {};
            if (key && data.used[key]) return data;

            if (!data.solo) {
                data.scores ??= {};
                data.stats ??= {};
                data.scores[playerId] = (data.scores[playerId] || 0) + totalGain;

                const s = data.stats[playerId] || { totalTimeMs: 0, answeredCount: 0, jillaCount: 0, doubleCount: 0 };
                s.totalTimeMs += elapsed;
                s.answeredCount += 1;
                if (isDouble) s.doubleCount += 1;
                data.stats[playerId] = s;
            }

            data.answers ??= [];
            const id = (typeof crypto !== "undefined" && crypto.randomUUID)
                ? crypto.randomUUID()
                : `${Date.now()}_${Math.random()}`;

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

            // beurt doorschuiven (skip jail)
            const ids = (Array.isArray(data.playersOrder) ? data.playersOrder : Object.keys(data.players || {}))
                .filter((id) => data.players && data.players[id]);
            if (ids.length > 0) {
                let idx = Math.max(0, ids.indexOf(data.turn));
                for (let i = 0; i < ids.length; i++) {
                    idx = (idx + 1) % ids.length;
                    const cand = ids[idx];
                    data.jail ??= {};
                    const j = data.jail[cand] || 0;
                    if (j > 0) { data.jail[cand] = j - 1; continue; }
                    data.turn = cand;
                    break;
                }
                if (!ids.includes(data.turn)) data.turn = ids[0];
            }

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
            triggerScoreToast(`+${totalGain} punten${isDouble ? ` (incl. +${DOUBLE_POF_BONUS} bonus)` : ""}`, "plus");
        }

        setAnswer("");
        setApiState({ status: "idle", msg: "" });
        setTimeout(() => inputRef.current?.focus(), 0);
    }
  


    async function useJilla() {
        if (!room || !room.started) return;
        const r = ref(db, `rooms/${roomCode}`);
        await runTransaction(r, (d) => {
            if (!d || d.paused) return d;
            if (d.turn !== playerId) return d;
            if (d.phase !== "answer") return d;

            d.jail ??= {};
            d.jail[playerId] = (d.jail[playerId] || 0) + 1;

            if (!d.solo) {
                d.scores ??= {};
                d.stats ??= {};
                d.scores[playerId] = (d.scores[playerId] || 0) - 25;
                const s = d.stats[playerId] || { totalTimeMs: 0, answeredCount: 0, jillaCount: 0, doubleCount: 0 };
                s.jillaCount = (s.jillaCount || 0) + 1;
                d.stats[playerId] = s;

                d.phase = "cooldown";
                d.cooldownEndAt = Date.now() + 5000;
                d.turnStartAt = null;
            } else {
                d.phase = "answer";
                d.turnStartAt = null;
                d.cooldownEndAt = null;
            }

            advanceTurn(d);
            return d;
        });
        triggerScoreToast("-25 punten (Jilla)", "minus");
    }


    async function leaveRoom() {
        if (!roomCode) { setRoom(null); setRoomCode(""); setIsHost(false); return; }
        const r = ref(db, `rooms/${roomCode}`);
        await runTransaction(r, (data) => {
            if (!data) return data;
            if (data.players && data.players[playerId]) delete data.players[playerId];
            if (data.jail && data.jail[playerId] != null) delete data.jail[playerId];
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

    // Leaderboard helpers
    function ordinal(n) { return `${n}e`; }
    function buildLeaderboardSnapshot(rm) {
        const par = rm.participants ? Object.keys(rm.participants) : [];
        const arr = par.map(id => {
            const name = rm.participants[id]?.name || rm.players?.[id]?.name || "Speler";
            const score = (!rm.solo && rm.scores && rm.scores[id]) || 0;
            const st = (rm.stats && rm.stats[id]) || { totalTimeMs: 0, answeredCount: 0, jillaCount: 0, doubleCount: 0 };
            const avg = st.answeredCount > 0 ? (st.totalTimeMs / st.answeredCount) : null;
            return { id, name, score, avgMs: avg, answered: st.answeredCount || 0, jilla: st.jillaCount || 0, dpf: st.doubleCount || 0 };
        });
        arr.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        return arr;
    }

    async function pauseGame() {
        if (!roomCode || !room) return;
        await runTransaction(ref(db, `rooms/${roomCode}`), (d) => {
            if (!d || d.paused) return d;
            d.paused = true;
            d.pausedAt = Date.now();
            return d;
        });
    }

    async function resumeGame() {
        if (!roomCode || !room) return;
        await runTransaction(ref(db, `rooms/${roomCode}`), (d) => {
            if (!d || !d.paused) return d;
            const delta = Date.now() - (d.pausedAt || Date.now());
            if (d.cooldownEndAt) d.cooldownEndAt += delta;
            if (d.turnStartAt) d.turnStartAt += delta;
            d.paused = false;
            d.pausedAt = null;
            return d;
        });
    }

    async function onLeaveClick() {
        if (room && (room.participants || room.players)) {
            const snap = buildLeaderboardSnapshot(room);
            setLeaderData(snap);
            setLeaderOpen(true);
        }
        await leaveRoom();
    }

    async function checkAnimalViaAPI() {
        const q = (answer || "").trim();
        if (!q) {
            setApiState({ status: "idle", msg: "" });
            return;
        }

        try {
            setApiState({ status: "checking", msg: "Bezig met controleren…" });

            // Gebruik een relatieve URL; werkt lokaal (Vite/CRA) en op Vercel:
            const resp = await fetch(`/api/check-animal?name=${encodeURIComponent(q)}`, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });

            if (!resp.ok) {
                const text = await resp.text().catch(() => "");
                setApiState({ status: "error", msg: `API error (${resp.status}) ${text}` });
                return;
            }

            const data = await resp.json();
            if (data?.ok && data?.found) {
                const source = data.source || "api";
                setApiState({ status: "ok", msg: `✅ Dier gevonden (${source})` });
            } else {
                setApiState({ status: "notfound", msg: "ℹ️ Niet gevonden in database" });
            }
        } catch (err) {
            setApiState({ status: "error", msg: `Netwerkfout: ${String(err)}` });
        }
    }


    /* ---------- cooldown tick ---------- */
    const inCooldown = room?.phase === "cooldown" && !room?.solo && room?.started;
    const cooldownLeftMs = Math.max(0, (room?.cooldownEndAt || 0) - now);
    useEffect(() => {
        if (!roomCode || !room) return;
        if (room.solo) return;
        if (!room.started) return;
        if (room.paused) return;
        if (room.phase === "cooldown" && room.cooldownEndAt && now >= room.cooldownEndAt) {
            runTransaction(ref(db, `rooms/${roomCode}`), (data) => {
                if (!data || data.solo || data.paused || !data.started) return data;
                if (data.phase !== "cooldown") return data;
                if (!data.cooldownEndAt || Date.now() < data.cooldownEndAt) return data;
                data.phase = "answer";
                data.turnStartAt = Date.now();
                return data;
            });
        }
    }, [roomCode, room?.phase, room?.cooldownEndAt, room?.paused, room?.started, now, room]);

    // bevroren weergave van tijd wanneer pauze
    const answerElapsedMs = (!room?.solo && room?.started && room?.phase === "answer" && room?.turnStartAt)
        ? Math.max(0, (room?.paused ? (room.pausedAt || now) : now) - room.turnStartAt)
        : 0;

    const potentialPoints = (!room?.solo && room?.started && !room?.paused)
        ? calcPoints(answerElapsedMs)
        : 0;


    // beginletter validatie voor UI (disable knop + enter)
    const beginsOk = !requiredLetter || firstAlphaLetter(answer) === requiredLetter;
    const canSubmit = isMyTurn && !inCooldown && !room?.paused && room?.started && beginsOk;

    /* ---------- UI ---------- */
    return (
        <>
            <GlobalStyle />
            <div style={styles.wrap}>
                {/* Header */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h1 className="h1">{SITE_TITLE}</h1>
                    <p className="muted" style={{ marginTop: 0 }}>
                        Typ een dier. Het moet beginnen met de <b>vereiste beginletter</b>. De volgende beginletter wordt de <b>laatste letter</b> van jouw woord.
                    </p>
                    <div className="row">
                        {!room?.started && (
                            <input
                                className="input"
                                placeholder="Jouw naam"
                                value={playerName}
                                onChange={e => setPlayerName(e.target.value)}
                            />
                        )}

                        {!isOnlineRoom ? (
                            <>
                                <Button onClick={() => createRoom()} disabled={!online}>Room aanmaken</Button>
                                <input
                                    className="input"
                                    placeholder="Room code"
                                    value={roomCodeInput}
                                    onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                                />
                                <Button variant="alt" onClick={joinRoom} disabled={!online}>Join</Button>
                            </>
                        ) : (
                            <>
                                {!room?.started && isHost && (
                                    <Button onClick={startGame}>Start spel</Button>
                                )}
                                {!room?.started && !isHost && <span className="badge">Wachten op host…</span>}
                                {room?.started && <span className="badge">Multiplayer actief</span>}

                                {/* Pauze / Hervat */}
                                {room?.started && !room?.paused && (
                                    <Button variant="alt" onClick={pauseGame}>⏸️ Pauzeer (iedereen)</Button>
                                )}
                                {room?.started && room?.paused && (
                                    <Button onClick={resumeGame}>▶️ Hervatten</Button>
                                )}
                                <Button variant="warn" onClick={onLeaveClick}>Leave</Button>
                                {!room?.started && <span className="badge">Room: <b>{roomCode}</b></span>}
                            </>
                        )}

                        {!online && !isOnlineRoom && (
                            <span className="badge">Offline: maak verbinding om te spelen</span>
                        )}
                    </div>
                </div>

                {/* Speelveld */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <div className="center">
                        <div className="letterBig">{room?.lastLetter ? room.lastLetter : "?"}</div>
                    </div>

                    <div className="center" style={{ marginBottom: 8 }}>
                        <div className="row" style={{ justifyContent: "center" }}>
                            <span className="badge">
                                Vereiste beginletter: <b>{room?.lastLetter || "?"}</b>
                            </span>

                            {room?.paused && <span className="badge">⏸️ Gepauzeerd</span>}

                            {isOnlineRoom && room?.started && !room?.solo && (
                                inCooldown
                                    ? <span className="badge">⏳ Volgende ronde over {Math.ceil(cooldownLeftMs / 1000)}s</span>
                                    : <>
                                        <span className="badge">
                                            ⏱️ Tijd: {Math.floor(answerElapsedMs / 1000)}s / {Math.floor(MAX_TIME_MS / 1000)}s
                                        </span>
                                        <span className="badge">🏅 Nu waard: <b>{potentialPoints}</b></span>
                                    </>
                            )}
                        </div>
                    </div>

                    {isOnlineRoom && room?.started ? (
                        <>
                            {/* Jilla status voor mij */}
                            {(room?.jail?.[playerId] || 0) > 0 && (
                                <div className="center" style={{ marginBottom: 8 }}>
                                    <span className="badge">🔒 Jilla actief — je wordt {room.jail[playerId]} beurt(en) overgeslagen</span>
                                </div>
                            )}

                            <div className="row" style={{ justifyContent: "center" }}>
                                <input
                                    ref={inputRef}
                                    className="input"
                                    style={{ minWidth: 260, maxWidth: 420, width: "100%" }}
                                    placeholder={
                                        room?.paused ? "Gepauzeerd…"
                                            : !isMyTurn ? "Niet jouw beurt"
                                                : inCooldown ? "Wachten…"
                                                    : (requiredLetter ? `Begin met: ${requiredLetter}` : "Typ een dier en druk Enter")
                                    }
                                    value={answer}
                                    onChange={(e) => { setAnswer(e.target.value); setApiState({ status: "idle", msg: "" }); }}
                                    onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submitAnswerOnline(); }}
                                    disabled={!isMyTurn || inCooldown || room?.paused || (room?.jail?.[playerId] || 0) > 0}
                                />
                            </div>

                            <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
                                <Button variant="alt" onClick={checkAnimalViaAPI} disabled={!answer.trim() || room?.paused}>
                                    Check dier (API)
                                </Button>
                                {isMyTurn && !inCooldown && !room?.paused && (
                                    <Button variant="alt" onClick={useJilla}>Jilla (skip)</Button>
                                )}
                                <Button onClick={submitAnswerOnline} disabled={!canSubmit || (room?.jail?.[playerId] || 0) > 0}>
                                    Indienen
                                </Button>
                            </div>

                            {apiState.status !== "idle" && (
                                <div className="center" style={{ marginTop: 8 }}>
                                    <span
                                        className="badge"
                                        style={{
                                            background:
                                                apiState.status === "ok" ? "rgba(34,197,94,.15)" :
                                                    apiState.status === "notfound" ? "rgba(234,179,8,.12)" :
                                                        apiState.status === "checking" ? "rgba(59,130,246,.12)" :
                                                            "rgba(239,68,68,.12)",
                                            borderColor:
                                                apiState.status === "ok" ? "rgba(34,197,94,.35)" :
                                                    apiState.status === "notfound" ? "rgba(234,179,8,.35)" :
                                                        apiState.status === "checking" ? "rgba(59,130,246,.35)" :
                                                            "rgba(239,68,68,.35)"
                                        }}
                                    >
                                        {apiState.msg}
                                    </span>
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="muted center" style={{ marginTop: 4 }}>
                            Maak of join een room om te spelen.
                        </p>
                    )}
                </div>

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
                                    const jcount = (room.jail && room.jail[id]) || 0;
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
                                                {" "}{jcount > 0 && <span className="badge">Jilla x{jcount}</span>}
                                                {" "}{active && <span className="badge">🟢 beurt</span>}
                                            </div>
                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                {active ? <div /> : <div style={{ opacity: 0.6 }}>—</div>}
                                            </div>
                                        </li>
                                    );
                                })}
                        </ul>
                    </Section>
                )}

                {/* GESCHIEDENIS */}
                {isOnlineRoom && room?.answers && room.answers.length > 0 && (
                    <Section title="Antwoorden (laatste eerst)">
                        <ul style={styles.list}>
                            {[...room.answers].slice().reverse().map((a) => {
                                const secs = (a.timeMs / 1000).toFixed(2);
                                const pts = room.solo ? 0 : (a.points || 0);
                                const ptsLabel = pts >= 0 ? `+${pts}` : `${pts}`;
                                return (
                                    <li key={a.id} style={styles.li}>
                                        <div style={styles.liText}>
                                            <b>{a.name}</b> → <b>{a.answer}</b>
                                            {" "}<span className="badge">⏱ {secs}s</span>
                                            {" "}{!room.solo && <span className="badge">🏅 {ptsLabel}</span>}
                                            {" "}{a.double && <span className="badge">💥 Dubble pof</span>}
                                        </div>
                                        <div className="muted">{new Date(a.ts).toLocaleTimeString()}</div>
                                    </li>
                                );
                            })}
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

            {/* Leaderboard overlay */}
            {leaderOpen && leaderData && (
                <div className="overlay" onClick={() => setLeaderOpen(false)}>
                    <div className="dialog" onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginTop: 0, marginBottom: 8 }}>🏆 Leaderboard</h2>
                        <table className="table">
                            <thead><tr><th>Rang</th><th>Speler</th><th>Punten</th><th>Gem. tijd / vraag</th><th>Jilla</th><th>Dubble pof</th></tr></thead>
                            <tbody>
                                {leaderData.map((r, i) => (
                                    <tr key={r.id}>
                                        <td>{ordinal(i + 1)}</td>
                                        <td>{r.name}</td>
                                        <td>{r.score}</td>
                                        <td>{r.avgMs == null ? "—" : `${(r.avgMs / 1000).toFixed(1)}s`}</td>
                                        <td>{r.jilla}</td>
                                        <td>{r.dpf}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                            <Button variant="alt" onClick={() => setLeaderOpen(false)}>Sluiten</Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

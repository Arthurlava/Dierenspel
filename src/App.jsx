// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
    getDatabase, ref, onValue, set, update, get, runTransaction,
    serverTimestamp, onDisconnect, remove
} from "firebase/database";

/* -------------------- Spel-constanten -------------------- */
const MAX_TIME_MS = 120_000;   // 2 min tot 0 punten
const MAX_POINTS = 200;        // direct antwoord
const DOUBLE_POF_BONUS = 100;  // begint & eindigt op dezelfde letter
const JILLA_PENALTY = 25;      // skip kost punten
const COOLDOWN_MS = 5_000;

const PID_KEY = "ppp.playerId";
const NAME_KEY = "ppp.playerName";
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/* -------------------- Firebase -------------------- */
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

/* -------------------- Helpers -------------------- */
const styles = {
    wrap: { maxWidth: 720, margin: "0 auto", padding: 16, color: "#fff", fontFamily: "system-ui, sans-serif" },
    card: { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 12, padding: 16 },
    row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
    btn: { padding: "10px 14px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer" },
    btnAlt: { background: "#065f46" },
    btnWarn: { background: "#dc2626" },
    input: { padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.06)", color: "#fff", outline: "none" },
    h1: { margin: "0 0 8px 0" },
    badge: { background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", padding: "6px 10px", borderRadius: 999, fontSize: 12 }
};

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
function normalize(s) {
    return (s || "")
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
}
function firstLetter(s) {
    const n = normalize(s).replace(/[^a-z0-9]/g, "");
    return n.charAt(0) || "";
}
function lastLetter(s) {
    const n = normalize(s).replace(/[^a-z0-9]/g, "");
    return n.charAt(n.length - 1) || "";
}
function isDoublePof(word) {
    const a = firstLetter(word);
    const b = lastLetter(word);
    return a && b && a === b;
}
function useOnline() {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true), off = () => setOnline(false);
        window.addEventListener("online", on); window.addEventListener("offline", off);
        return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    }, []);
    return online;
}

/* -------------------- Dierenregister (kleine set, uitbreidbaar) -------------------- */
const BUILTIN_ANIMALS = [
    "aap", "adelaar", "alk", "albatros", "alligator", "anaconda", "antilope", "arend", "beer", "bever", "bison", "boa",
    "bok", "bruine beer", "buizerd", "bultrug", "dolfijn", "das", "duif", "dromedaris", "egel", "eland", "ezel", "fret",
    "flamingo", "gans", "gazelle", "geit", "gier", "giraffe", "gorilla", "hap", "haai", "havik", "hert", "hyena", "ijsbeer",
    "ijsvogel", "jak", "jaguar", "kameel", "kanarie", "kat", "kievit", "kiwi", "koala", "kikker", "konijn", "kraai", "krokodil",
    "lama", "leeuw", "leguaan", "luiaard", "lynx", "marters", "marter", "miereneter", "mol", "muis", "nandoe", "neushoorn",
    "octopus", "olifant", "ooievaar", "orakelvis", "orka", "otter", "paard", "panda", "papegaai", "parkiet", "pauw",
    "pelikaan", "pinguïn", "poema", "ree", "rendier", "rog", "salamander", "schaap", "schildpad", "slang", "specht", "spin",
    "springbok", "tapir", "tijger", "toekan", "uil", "varaan", "vos", "walrus", "wangz", "wasbeer", "waterbuffel", "wezel",
    "wolf", "wombat", "yak", "zalm", "zebra", "zeehond", "zeekoe", "zeester", "zwaluw"
];
const ANIMALS_SET = new Set(BUILTIN_ANIMALS.map(normalize));

/* =========================================================
   App: Dierenspel (Rooms + Punten + Jilla + Dubble Pof)
   ========================================================= */
export default function App() {
    // profiel
    const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) || "");
    const [playerId] = useState(getOrCreatePlayerId);
    useEffect(() => { localStorage.setItem(NAME_KEY, playerName || ""); }, [playerName]);

    // netstatus
    const online = useOnline();

    // room state
    const [roomCode, setRoomCode] = useState("");
    const [roomCodeInput, setRoomCodeInput] = useState("");
    const [room, setRoom] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const isOnlineRoom = !!roomCode;
    const isMyTurn = isOnlineRoom && room?.turn === playerId;

    // presence cleanup
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
                remove(ref(db, `rooms_animals/${roomCode}/presence/${playerId}/${connIdRef.current}`)).catch(() => { });
                connIdRef.current = null;
            }
            unsub?.();
        };
    }, [roomCode, playerId]);

    // tijd / toasts
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
    const [toast, setToast] = useState(null);
    const showToast = (txt, ms = 1500) => {
        setToast(txt); setTimeout(() => setToast(null), ms);
    };

    // input
    const [animalInput, setAnimalInput] = useState("");
    const inputRef = useRef(null);

    // cooldowndata
    const inCooldown = room?.phase === "cooldown" && !room?.solo;
    const cooldownLeftMs = Math.max(0, (room?.cooldownEndAt || 0) - now);
    const answerElapsedMs = (!room?.solo && room?.phase === "answer" && room?.turnStartAt)
        ? Math.max(0, now - room.turnStartAt) : 0;
    const potentialPoints = !room?.solo ? calcPoints(answerElapsedMs) : 0;

    // attach listener
    function attachRoom(code) {
        const r = ref(db, `rooms_animals/${code}`);
        onValue(r, (snap) => {
            const data = snap.val() || null;
            setRoom(data);
            setIsHost(!!data && data.hostId === playerId);

            if (!data) return;
            // lichte self-heal: host/turn bestaan
            if (!data.players || Object.keys(data.players).length === 0) return;
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

    // create/join/leave
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
            lastLetter: "?",              // spel start zonder restrictie
            started: false,
            solo: false,
            jail: {},
            scores: {},
            stats: {},
            phase: "answer",
            turnStartAt: null,
            cooldownEndAt: null,
            version: 1
        };
        await set(ref(db, `rooms_animals/${code}`), obj);
        setRoomCode(code);
        setIsHost(true);
        attachRoom(code);
    }

    async function joinRoom() {
        if (!online) { alert("Je bent offline."); return; }
        const code = (roomCodeInput || "").trim().toUpperCase();
        if (!code) { alert("Voer een room code in."); return; }
        const r = ref(db, `rooms_animals/${code}`);
        const s = await get(r);
        if (!s.exists()) { alert("Room niet gevonden."); return; }

        await runTransaction(r, (d) => {
            if (!d) return d;
            d.players ??= {};
            d.players[playerId] = { name: playerName || "Speler", joinedAt: serverTimestamp() };

            d.participants ??= {};
            d.participants[playerId] = d.participants[playerId] || { name: playerName || "Speler", firstJoinedAt: serverTimestamp() };
            d.participants[playerId].name = playerName || d.participants[playerId].name;

            d.playersOrder ??= [];
            if (!d.playersOrder.includes(playerId)) d.playersOrder.push(playerId);

            d.jail ??= {};
            d.scores ??= {};
            d.stats ??= {};
            d.phase ??= "answer";
            if (!d.turnStartAt && !d.solo && d.started) d.turnStartAt = Date.now();

            if (!d.turn || !d.players[d.turn]) d.turn = d.playersOrder[0];
            if (!d.hostId || !d.players[d.hostId]) d.hostId = d.playersOrder[0];
            return d;
        });

        setRoomCode(code);
        setIsHost(false);
        attachRoom(code);
    }

    async function leaveRoom() {
        if (!roomCode) return;
        await runTransaction(ref(db, `rooms_animals/${roomCode}`), (d) => {
            if (!d) return d;
            if (d.players && d.players[playerId]) delete d.players[playerId];
            if (d.jail && d.jail[playerId] != null) delete d.jail[playerId];
            if (Array.isArray(d.playersOrder)) d.playersOrder = d.playersOrder.filter(id => id !== playerId && d.players && d.players[id]);

            const ids = d.players ? Object.keys(d.players) : [];
            if (ids.length === 0) return null;

            if (!d.hostId || !d.players[d.hostId]) d.hostId = d.playersOrder?.[0] || ids[0];
            if (!d.turn || !d.players[d.turn]) d.turn = d.playersOrder?.[0] || d.hostId || ids[0];
            return d;
        });

        if (connIdRef.current) {
            remove(ref(db, `rooms_animals/${roomCode}/presence/${playerId}/${connIdRef.current}`)).catch(() => { });
            connIdRef.current = null;
        }

        setRoomCode("");
        setRoom(null);
        setIsHost(false);
    }

    async function startGame() {
        if (!room || !isHost) return;
        await update(ref(db, `rooms_animals/${roomCode}`), {
            started: true,
            lastLetter: "?",
            phase: "answer",
            turn: room.playersOrder?.[0] || room.hostId,
            turnStartAt: Date.now(),
            cooldownEndAt: null
        });
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    // beurt-doorstroom
    function advanceTurnWithJail(d) {
        const ids = (Array.isArray(d.playersOrder) ? d.playersOrder : Object.keys(d.players || {}))
            .filter((id) => d.players && d.players[id]);
        if (ids.length === 0) return null;

        d.jail ??= {};
        let idx = Math.max(0, ids.indexOf(d.turn));
        for (let tries = 0; tries < ids.length; tries++) {
            idx = (idx + 1) % ids.length;
            const cand = ids[idx];
            const j = d.jail[cand] || 0;
            if (j > 0) { d.jail[cand] = j - 1; continue; }
            d.turn = cand;
            return cand;
        }
        d.turn = ids[(ids.indexOf(d.turn) + 1) % ids.length];
        return d.turn;
    }

    // cooldown -> answer
    useEffect(() => {
        if (!roomCode || !room) return;
        if (room.solo) return;
        if (room.phase === "cooldown" && room.cooldownEndAt && now >= room.cooldownEndAt) {
            runTransaction(ref(db, `rooms_animals/${roomCode}`), (d) => {
                if (!d || d.solo) return d;
                if (d.phase !== "cooldown") return d;
                if (!d.cooldownEndAt || Date.now() < d.cooldownEndAt) return d;
                d.phase = "answer";
                d.turnStartAt = Date.now();
                return d;
            });
        }
    }, [roomCode, room?.phase, room?.cooldownEndAt, now, room]);

    // Dier indienen
    async function submitAnimal() {
        if (!room || !room.started) return;
        const wordRaw = animalInput.trim();
        if (!wordRaw) return;

        const word = normalize(wordRaw);
        const found = ANIMALS_SET.has(word);
        const req = (room.lastLetter && room.lastLetter !== "?") ? room.lastLetter : null;
        const beginsOk = !req || firstLetter(wordRaw) === req;

        const isMP = !!room && !room.solo;
        const elapsed = Math.max(0, Date.now() - (room?.turnStartAt ?? Date.now()));
        const basePoints = isMP ? calcPoints(elapsed) : 0;
        const double = isDoublePof(wordRaw);
        const bonus = isMP && double ? DOUBLE_POF_BONUS : 0;
        const totalGain = beginsOk ? (basePoints + bonus) : 0; // geen punten als verkeerde beginletter

        const nextLast = lastLetter(wordRaw) || "?";

        const r = ref(db, `rooms_animals/${roomCode}`);
        await runTransaction(r, (d) => {
            if (!d) return d;
            if (!d.players || !d.players[d.turn]) return d;
            if (d.turn !== playerId) return d;
            if (d.phase !== "answer") return d;

            // scores/stats alleen in MP
            if (isMP) {
                d.scores ??= {};
                d.stats ??= {};
                if (beginsOk) d.scores[playerId] = (d.scores[playerId] || 0) + totalGain;

                const s = d.stats[playerId] || { totalTimeMs: 0, answeredCount: 0, jillaCount: 0, doubleCount: 0 };
                s.totalTimeMs += elapsed;
                if (beginsOk) s.answeredCount += 1;
                if (double && beginsOk) s.doubleCount += 1;
                d.stats[playerId] = s;
            }

            // altijd door, ook als dier niet in register is of verkeerde beginletter
            d.lastLetter = nextLast;
            advanceTurnWithJail(d);

            if (isMP) {
                d.phase = "cooldown";
                d.cooldownEndAt = Date.now() + COOLDOWN_MS;
                d.turnStartAt = null;
            } else {
                d.phase = "answer";
                d.turnStartAt = null;
                d.cooldownEndAt = null;
            }
            return d;
        });

        if (found) showToast("✅ Dier gevonden in dierenregister");
        else showToast("ℹ️ Dier niet gevonden — toch verder");

        if (isMP && totalGain > 0 && beginsOk) {
            showToast(`+${totalGain} punten${double ? ` (incl. +${DOUBLE_POF_BONUS} Dubble pof)` : ""}`, 1600);
        }
        if (double && beginsOk) showToast("💥 Dubble pof!", 1200);

        setAnimalInput("");
    }

    // Jilla (vraag/woord overslaan)
    async function useJilla() {
        if (!room) return;
        const isMP = !!room && !room.solo;
        const r = ref(db, `rooms_animals/${roomCode}`);
        await runTransaction(r, (d) => {
            if (!d) return d;
            if (!d.players || !d.players[d.turn]) return d;
            if (d.turn !== playerId) return d;
            if (d.phase !== "answer") return d;

            d.jail ??= {};
            d.jail[playerId] = (d.jail[playerId] || 0) + 1;

            if (isMP) {
                d.scores ??= {};
                d.stats ??= {};
                d.scores[playerId] = (d.scores[playerId] || 0) - JILLA_PENALTY;

                const s = d.stats[playerId] || { totalTimeMs: 0, answeredCount: 0, jillaCount: 0, doubleCount: 0 };
                s.jillaCount += 1;
                d.stats[playerId] = s;

                d.phase = "cooldown";
                d.cooldownEndAt = Date.now() + COOLDOWN_MS;
                d.turnStartAt = null;
            } else {
                d.phase = "answer";
                d.turnStartAt = null;
                d.cooldownEndAt = null;
            }
            advanceTurnWithJail(d);
            return d;
        });
        if (isMP) showToast(`-${JILLA_PENALTY} punten (Jilla)`);
    }

    const myJail = isOnlineRoom && room?.jail ? (room.jail[playerId] || 0) : 0;

    // UI helpers
    const canType = isMyTurn && myJail === 0 && !inCooldown && room?.started;
    useEffect(() => { if (canType) setTimeout(() => inputRef.current?.focus(), 0); }, [canType]);

    return (
        <div style={styles.wrap}>
            <h1 style={styles.h1}>PimPamPof — Dierenspel</h1>
            <p style={{ opacity: .8, marginTop: 0 }}>Vraag: <b>Noem een dier</b>. Begin met de <i>vereiste beginletter</i> (als getoond). Volgende beginletter = laatste letter van jouw woord.</p>

            {/* Top controls */}
            <div style={{ ...styles.card, marginBottom: 12 }}>
                <div style={styles.row}>
                    {!room?.started && (
                        <input
                            style={styles.input}
                            placeholder="Jouw naam"
                            value={playerName}
                            onChange={e => setPlayerName(e.target.value)}
                        />
                    )}
                    {!isOnlineRoom && (
                        <>
                            <button style={{ ...styles.btn, ...styles.btnAlt }} onClick={createRoom} disabled={!online}>Room aanmaken</button>
                            <input
                                style={styles.input}
                                placeholder="Room code"
                                value={roomCodeInput}
                                onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                            />
                            <button style={{ ...styles.btn, ...styles.btnAlt }} onClick={joinRoom} disabled={!online}>Join</button>
                        </>
                    )}
                    {isOnlineRoom && (
                        <>
                            {!room?.started && isHost && <button style={styles.btn} onClick={startGame}>Start spel</button>}
                            {!room?.started && !isHost && <span style={styles.badge}>Wachten op host…</span>}
                            {room?.started && <span style={styles.badge}>Multiplayer actief</span>}
                            <button style={{ ...styles.btn, ...styles.btnWarn }} onClick={leaveRoom}>Leave</button>
                            {!room?.started && <span style={styles.badge}>Room: <b>{roomCode}</b></span>}
                        </>
                    )}
                    {!online && !isOnlineRoom && <span style={styles.badge}>Offline: maak verbinding om te spelen</span>}
                </div>
            </div>

            {/* Speelveld */}
            {isOnlineRoom && room?.started && (
                <div style={{ ...styles.card, marginBottom: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                        <div style={styles.row}>
                            <span style={styles.badge}>Room: <b>{roomCode}</b></span>
                            <span style={styles.badge}>Vereiste beginletter: <b>{room?.lastLetter || "?"}</b></span>
                            {!room.solo && (
                                inCooldown
                                    ? <span style={styles.badge}>⏳ Volgende ronde over {Math.ceil(cooldownLeftMs / 1000)}s</span>
                                    : <span style={styles.badge}>⏱️ Tijd: {Math.floor(answerElapsedMs / 1000)}s / {Math.floor(MAX_TIME_MS / 1000)}s</span>
                            )}
                            {!room.solo && !inCooldown && <span style={styles.badge}>🏅 Nu waard: <b>{potentialPoints}</b></span>}
                        </div>

                        {myJail > 0 && <div style={styles.badge}>🔒 Jilla actief — je wordt {myJail} beurt(en) overgeslagen</div>}

                        <div className="input-row" style={styles.row}>
                            <input
                                ref={inputRef}
                                style={{ ...styles.input, minWidth: 260 }}
                                placeholder={
                                    !isMyTurn ? "Niet jouw beurt"
                                        : myJail > 0 ? "Jilla actief — beurt wordt overgeslagen"
                                            : inCooldown ? "Wachten…"
                                                : "Typ een dier en druk Enter"
                                }
                                value={animalInput}
                                onChange={(e) => setAnimalInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") submitAnimal(); }}
                                disabled={!canType}
                            />
                            {isMyTurn && !inCooldown && <button style={{ ...styles.btn, ...styles.btnAlt }} onClick={useJilla}>Jilla (skip)</button>}
                            <button style={{ ...styles.btn }} onClick={submitAnimal} disabled={!canType}>Indienen</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Spelers + scores */}
            {isOnlineRoom && room?.participants && (
                <div style={styles.card}>
                    <h3 style={{ marginTop: 0 }}>Spelers</h3>
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
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        padding: "8px 0", borderTop: "1px solid rgba(255,255,255,.1)"
                                    }}>
                                        <div>
                                            {idx + 1}. {pName}{room?.hostId === id ? " (host)" : ""}{" "}
                                            {active && <span style={styles.badge}>🟢 beurt</span>}{" "}
                                            {jcount > 0 && <span style={styles.badge}>Jilla x{jcount}</span>}
                                        </div>
                                        {!room.solo && <div style={styles.badge}>Punten: <b>{score}</b></div>}
                                    </li>
                                );
                            })}
                    </ul>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div style={{
                    position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)",
                    background: "linear-gradient(90deg,#22c55e,#16a34a)", color: "#041507",
                    padding: "10px 14px", borderRadius: 999, fontWeight: 800, boxShadow: "0 10px 28px rgba(0,0,0,.35)", zIndex: 10
                }}>
                    {toast}
                </div>
            )}

            {/* Achtergrondstijl */}
            <style>{`
        html, body, #root { height: 100%; }
        body { margin: 0; background: linear-gradient(180deg, #171717 0%, #262626 100%); }
        button:disabled { opacity: .6; cursor: not-allowed; }
      `}</style>
        </div>
    );
}

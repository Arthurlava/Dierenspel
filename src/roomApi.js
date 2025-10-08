// src/roomApi.js
import { db } from "./firebase";
import { ref, set, update, get, onValue, runTransaction, serverTimestamp, remove } from "firebase/database";
import { norm, first, last, scoreWord, JILLA_PENALTY } from "./gameLogic";

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const makeRoomCode = (len = 5) => Array.from({ length: len }, ()
    => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export function attachRoomListener(code, cb) {
    const r = ref(db, `rooms/${code}`);
    const unsub = onValue(r, s => cb(s.val() ?? null));
    return () => unsub();
}

export async function createRoom({ hostId, hostName }) {
    const code = makeRoomCode();
    const obj = {
        createdAt: serverTimestamp(),
        hostId,
        players: { [hostId]: { name: hostName || "Host", joinedAt: serverTimestamp() } },
        participants: { [hostId]: { name: hostName || "Host", firstJoinedAt: serverTimestamp() } },
        playersOrder: [hostId],
        started: false,
        turn: hostId,
        phase: "answer",              // "answer" | "cooldown"
        cooldownEndAt: null,
        turnStartAt: null,            // set bij start
        requiredStart: "?",           // volgende woord moet (mag) met deze letter starten
        lastWord: "",
        lastAnimalKnown: null,
        scores: {},
        jail: {},
        version: 1
    };
    await set(ref(db, `rooms/${code}`), obj);
    return code;
}

export async function joinRoom({ code, playerId, playerName }) {
    const r = ref(db, `rooms/${code}`);
    const snap = await get(r);
    if (!snap.exists()) throw new Error("Room niet gevonden");

    await runTransaction(r, data => {
        if (!data) return data;
        data.players ??= {};
        data.participants ??= {};
        data.players[playerId] = { name: playerName || "Speler", joinedAt: serverTimestamp() };
        data.participants[playerId] ??= { name: playerName || "Speler", firstJoinedAt: serverTimestamp() };
        data.participants[playerId].name = playerName || data.participants[playerId].name;

        data.playersOrder ??= [];
        if (!data.playersOrder.includes(playerId)) data.playersOrder.push(playerId);

        data.scores ??= {};
        data.jail ??= {};
        data.phase ??= "answer";
        data.turn ??= data.playersOrder[0] || playerId;
        data.hostId ??= data.playersOrder[0] || playerId;
        return data;
    });
}

export async function startRoom(code) {
    await update(ref(db, `rooms/${code}`), {
        started: true,
        phase: "answer",
        cooldownEndAt: null,
        turnStartAt: Date.now()
    });
}

function nextTurn(data) {
    const ids = (Array.isArray(data.playersOrder) ? data.playersOrder : Object.keys(data.players || {}))
        .filter(id => data.players && data.players[id]);
    if (ids.length === 0) return data;

    const curIdx = Math.max(0, ids.indexOf(data.turn));
    for (let i = 1; i <= ids.length; i++) {
        const idx = (curIdx + i) % ids.length;
        const cand = ids[idx];
        const jail = (data.jail?.[cand] ?? 0);
        if (jail > 0) { data.jail[cand] = jail - 1; continue; }
        data.turn = cand; break;
    }
    return data;
}

export async function submitWord({ code, playerId, word, knownAnimal, cooldownMs = 5000 }) {
    const r = ref(db, `rooms/${code}`);
    await runTransaction(r, data => {
        if (!data) return data;
        if (!data.started || data.phase !== "answer") return data;
        if (data.turn !== playerId) return data;

        const elapsed = Math.max(0, Date.now() - (data.turnStartAt ?? Date.now()));
        const { total, matchRequired, isDoublePof } = scoreWord({
            word, requiredStart: data.requiredStart, elapsedMs: elapsed
        });

        data.scores ??= {};
        data.scores[playerId] = (data.scores[playerId] || 0) + total;

        data.lastWord = word;
        data.lastAnimalKnown = !!knownAnimal;
        const nextReq = last(word) || "?";
        data.requiredStart = nextReq;

        // beurt doorgeven + cooldown
        nextTurn(data);
        data.phase = "cooldown";
        data.cooldownEndAt = Date.now() + cooldownMs;
        data.turnStartAt = null;

        // hintvelden voor UI (niet verplicht)
        data.lastWasRequiredMatch = matchRequired;
        data.lastWasDoublePof = isDoublePof;
        data.lastGain = total;

        return data;
    });
}

export async function tryStartNextAnswerPhase({ code }) {
    const r = ref(db, `rooms/${code}`);
    await runTransaction(r, data => {
        if (!data) return data;
        if (data.phase !== "cooldown") return data;
        if (!data.cooldownEndAt || Date.now() < data.cooldownEndAt) return data;
        data.phase = "answer";
        data.turnStartAt = Date.now();
        return data;
    });
}

export async function useJilla({ code, playerId, cooldownMs = 5000 }) {
    const r = ref(db, `rooms/${code}`);
    await runTransaction(r, data => {
        if (!data) return data;
        if (data.turn !== playerId) return data;
        if (data.phase !== "answer") return data;

        data.jail ??= {};
        data.scores ??= {};
        data.jail[playerId] = (data.jail[playerId] || 0) + 1;
        data.scores[playerId] = (data.scores[playerId] || 0) - JILLA_PENALTY;

        // geen woord, alleen beurt doorgeven
        nextTurn(data);
        data.phase = "cooldown";
        data.cooldownEndAt = Date.now() + cooldownMs;
        data.turnStartAt = null;
        data.lastWord = "";
        data.lastAnimalKnown = null;
        data.lastWasRequiredMatch = false;
        data.lastWasDoublePof = false;
        data.lastGain = -JILLA_PENALTY;
        return data;
    });
}

export async function leaveRoom({ code, playerId }) {
    const r = ref(db, `rooms/${code}`);
    await runTransaction(r, data => {
        if (!data) return data;
        if (data.players && data.players[playerId]) delete data.players[playerId];
        if (data.jail && data.jail[playerId] != null) delete data.jail[playerId];
        if (Array.isArray(data.playersOrder))
            data.playersOrder = data.playersOrder.filter(id => id !== playerId && data.players && data.players[id]);

        const ids = data.players ? Object.keys(data.players) : [];
        if (ids.length === 0) return null;

        if (!data.hostId || !data.players[data.hostId]) data.hostId = data.playersOrder?.[0] || ids[0];
        if (!data.turn || !data.players[data.turn] || data.turn === playerId)
            data.turn = data.playersOrder?.[0] || data.hostId || ids[0];

        return data;
    });

    try { await remove(ref(db, `rooms/${code}/presence/${playerId}`)); } catch { }
}

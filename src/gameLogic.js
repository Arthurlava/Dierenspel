// src/gameLogic.js
export const MAX_TIME_MS = 120000;
export const MAX_POINTS = 200;
export const JILLA_PENALTY = 25;

// Tweakbaar: apart bonusje voor juiste beginletter + Dubbel Pof
export const REQUIRED_MATCH_BONUS = 50;
export const DOUBLE_POF_BONUS = 100; // begin == eind

export function calcPoints(elapsedMs) {
	const p = Math.floor(MAX_POINTS * (1 - Math.min(elapsedMs, MAX_TIME_MS) / MAX_TIME_MS));
	return Math.max(0, p);
}

export const norm = s => (s ?? "").toString().trim().toLowerCase();
export const first = s => (norm(s)[0] ?? "");
export const last = s => {
	const w = norm(s); return w.length ? w[w.length - 1] : "";
};

export function scoreWord({ word, requiredStart, elapsedMs }) {
	const base = calcPoints(elapsedMs);
	const matchRequired = requiredStart && requiredStart !== "?" && first(word) === norm(requiredStart);
	const isDoublePof = word && first(word) && first(word) === last(word);
	const bonus = (matchRequired ? REQUIRED_MATCH_BONUS : 0) + (isDoublePof ? DOUBLE_POF_BONUS : 0);
	return { total: base + bonus, matchRequired, isDoublePof, base };
}

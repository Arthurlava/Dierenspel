// api/check-animal.js
// Doel: alleen "gevonden" bij VOLLEDIGE exact match (case/accents genegeerd)
// Bronnen: 1) lokale NL-lijst 2) GBIF suggest (exact) 3) Wikidata (exact + taxon-check)

function norm(s = "") {
  return s.toString().trim().toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function exactEquals(a, b) { return norm(a) === norm(b); }

// 1) Snelle NL-lijst (uitbreidbaar)
const LOCAL_NL_ANIMALS = [
  "hond","kat","geit","koe","paard","schaap","varken","ezel",
  "konijn","hamster","cavia","muis","rat","egel","eekhoorn","bever","otter",
  "vos","wolf","beer","leeuw","tijger","olifant","giraffe","zebra","krokodil",
  "alligator","schildpad","slang","kikker","pad","dolfijn","walvis","zeehond","zeeleeuw",
  "pinguïn","meeuw","duif","kraai","ekster","specht","arend","uil","papegaai","parkiet",
  "kip","haan","kalkoen","eend","gans","zwaan",
  "haai","rog","zalm","tonijn","kabeljauw","forel","karper","goudvis",
  "bij","wesp","mier","vlinder","libel",
  "hert","ree","neushoorn","nijlpaard","kameel","lama","alpaca","kangeroe","koala"
];
const LOCAL_SET = new Set(LOCAL_NL_ANIMALS.map(norm));

// Helpers: fetch met timeout
async function fetchJson(url, opts = {}, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { accept: "application/json", ...(opts.headers||{}) }});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// 2) GBIF exact: check vernacular/canonical/scientific exact gelijk
async function gbifExact(qRaw) {
  const url = "https://api.gbif.org/v1/species/suggest?q=" + encodeURIComponent(qRaw) + "&limit=25";
  const items = await fetchJson(url);
  const hit = items.find(it =>
    exactEquals(it.vernacularName || "", qRaw) ||
    exactEquals(it.canonicalName || "",  qRaw) ||
    exactEquals(it.scientificName || "", qRaw)
  );
  if (!hit) return null;
  return {
    source: "gbif:suggest",
    confidence: 100,
    usageKey: hit.usageKey ?? null,
    scientificName: hit.scientificName ?? hit.canonicalName ?? null,
    vernacularName: hit.vernacularName ?? null,
    rank: hit.rank ?? null
  };
}

// 3) Wikidata exact + taxon validatie
//   - Zoek exact label/alias (nl/en) via wbsearchentities
//   - Haal claims op en check of P225 (taxon name) of P105/P171 bestaat
async function wikidataExact(qRaw) {
  const base = "https://www.wikidata.org/w/api.php";
  const params =
    `action=wbsearchentities&format=json&language=nl&uselang=nl&type=item&limit=25&search=${encodeURIComponent(qRaw)}`;
  const s = await fetchJson(`${base}?origin=*&${params}`);
  const qNorm = norm(qRaw);

  // kies item met exact label of alias (NL of EN)
  let cand = null;
  for (const it of s.search || []) {
    const labelN = norm(it.label || "");
    const descN  = norm(it.description || "");
    const aliases = (it.aliases || []).map(norm);

    if (labelN === qNorm || aliases.includes(qNorm)) {
      cand = it; break;
    }

    // Heuristiek: als NL niet matcht, probeer engels label/alias via extra call is zwaar,
    // maar vaak zit de NL alias er al in. We houden het bij directe NL exact match.
  }
  if (!cand) return null;

  const id = cand.id; // Qxxxx
  const props = await fetchJson(`${base}?origin=*&action=wbgetentities&format=json&ids=${id}&props=claims`);
  const ent = props.entities?.[id];
  if (!ent || !ent.claims) return null;

  // P225 = taxon name, P105 = taxon rank, P171 = parent taxon
  const hasTaxonSignal =
    (ent.claims.P225 && ent.claims.P225.length) ||
    (ent.claims.P105 && ent.claims.P105.length) ||
    (ent.claims.P171 && ent.claims.P171.length);

  if (!hasTaxonSignal) return null;

  return {
    source: "wikidata",
    confidence: 100,
    wikidataId: id,
    label: cand.label || null,
    description: cand.description || null
  };
}

export default async function handler(req, res) {
  try {
    const qRaw = (req.query.name || "").trim();
    if (!qRaw) return res.status(400).json({ ok: false, error: "Missing ?name" });

    // 1) lokale exact-match
    if (LOCAL_SET.has(norm(qRaw))) {
      return res.status(200).json({
        ok: true, found: true, source: "local:nl",
        confidence: 100, vernacularName: qRaw
      });
    }

    // 2) GBIF exact
    try {
      const g = await gbifExact(qRaw);
      if (g) return res.status(200).json({ ok: true, found: true, ...g });
    } catch (_) { /* stil laten vallen, ga naar volgende bron */ }

    // 3) Wikidata exact + taxon-check
    try {
      const w = await wikidataExact(qRaw);
      if (w) return res.status(200).json({ ok: true, found: true, ...w });
    } catch (_) { /* ignore */ }

    // Niets gevonden
    return res.status(200).json({ ok: true, found: false, source: "none", confidence: 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

// api/check-animal.js
// Multi-source, exact whole-word match (case/accents ignored)
// Sources: 1) Local NL list 2) GBIF suggest (exact) 3) GBIF vernacularNames (nl/dut) 4) Wikidata exact (taxon)

function norm(s = "") {
  return s.toString().trim().toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function exactEquals(a, b) { return norm(a) === norm(b); }

// 1) Large NL list (extend freely)
const LOCAL_NL_ANIMALS = [
  "hond","kat","geit","koe","paard","schaap","varken","ezel","kalf","stier","rund",
  "konijn","hamster","cavia","muis","rat","egel","eekhoorn","bever","otter","marter","wezel",
  "vos","wolf","beer","leeuw","tijger","panter","poema","jaguar","lynx",
  "olifant","giraffe","zebra","neushoorn","nijlpaard","kameel","dromedaris","lama","alpaca",
  "aap","gorilla","chimpansee","orang-oetan","baviaan","makki","lemur",
  "krokodil","alligator","schildpad","slang","hagedis","varaan","leguaan",
  "kikker","pad","salamander","mol","egel",
  "dolfijn","walvis","orca","zeehond","zeeleeuw","walrus","otter",
  "pinguïn","meeuw","duif","kraai","ekster","kwikstaart","merel","mus","koolmees","pimpelmees",
  "specht","arend","havik","buizerd","uil","papegaai","parkiet","kanarie","zwaluw","ooievaar","reiger",
  "kip","haan","hen","kuiken","kalkoen","eend","gans","zwaan","fazant","patrijs",
  "haai","rog","zalm","tonijn","kabeljauw","forel","karper","snoek","baars","goudvis",
  "rups","vlinder","tor","kever","mier","wesp","bij","hommel","libel","sprinkhaan","oorwurm",
  "hert","ree","eland","rendier","muskusos","jak","bizon","buffel","everzwijn","zwijn","wild zwijn",
  "vos","ezel","egel","hond","geit","kat","koala","kangoeroe","emu","nandoe","dingo"
];
const LOCAL_SET = new Set(LOCAL_NL_ANIMALS.map(norm));

// small helper to fetch JSON with timeout
async function fetchJson(url, opts = {}, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { accept: "application/json", ...(opts.headers||{}) }});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// 2) GBIF suggest: exact match against vernacular/canonical/scientific
async function gbifSuggestExact(qRaw) {
  const url = "https://api.gbif.org/v1/species/suggest?q=" + encodeURIComponent(qRaw) + "&limit=25";
  const items = await fetchJson(url);
  const hit = items.find(it =>
    exactEquals(it.vernacularName || "", qRaw) ||
    exactEquals(it.canonicalName  || "", qRaw) ||
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

// 3) GBIF vernacularNames (fetch per candidate usageKey, look for nl/dut exact)
async function gbifVernacularExact(qRaw) {
  const qN = norm(qRaw);
  // first gather a few candidate usageKeys via suggest
  const sItems = await fetchJson("https://api.gbif.org/v1/species/suggest?q=" + encodeURIComponent(qRaw) + "&limit=10");
  const keys = [...new Set(sItems.map(it => it.usageKey).filter(Boolean))].slice(0, 8);
  if (keys.length === 0) return null;

  const requests = keys.map(async (k) => {
    const v = await fetchJson(`https://api.gbif.org/v1/species/${k}/vernacularNames?limit=200`);
    const list = Array.isArray(v.results) ? v.results : [];
    // language codes vary: 'nl', 'dut', 'nld'
    const nlNames = list
      .filter(x => ["nl","dut","nld"].includes((x.language || "").toLowerCase()))
      .map(x => x.vernacularName)
      .filter(Boolean);
    const exact = nlNames.find(name => norm(name) === qN);
    if (exact) {
      return {
        source: "gbif:vernacular",
        confidence: 100,
        usageKey: k,
        vernacularName: exact,
        scientificName: sItems.find(it => it.usageKey === k)?.scientificName ?? null
      };
    }
    return null;
  });

  const results = await Promise.allSettled(requests);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

// 4) Wikidata exact (nl label/alias) + taxon signal (P225, P105, P171)
async function wikidataExact(qRaw) {
  const base = "https://www.wikidata.org/w/api.php";
  const search = await fetchJson(`${base}?origin=*&action=wbsearchentities&format=json&language=nl&uselang=nl&type=item&limit=25&search=${encodeURIComponent(qRaw)}`);
  const qN = norm(qRaw);
  let cand = null;
  for (const it of search.search || []) {
    const labelN = norm(it.label || "");
    const aliases = (it.aliases || []).map(norm);
    if (labelN === qN || aliases.includes(qN)) { cand = it; break; }
  }
  if (!cand) return null;

  const id = cand.id;
  const ent = await fetchJson(`${base}?origin=*&action=wbgetentities&format=json&ids=${id}&props=claims`);
  const claims = ent?.entities?.[id]?.claims || {};
  const hasTaxonSignal = (claims.P225?.length || claims.P105?.length || claims.P171?.length);
  if (!hasTaxonSignal) return null;

  return { source: "wikidata", confidence: 100, wikidataId: id, label: cand.label || null };
}

export default async function handler(req, res) {
  try {
    const qRaw = (req.query.name || "").trim();
    if (!qRaw) return res.status(400).json({ ok: false, error: "Missing ?name" });

    // 1) Local NL list
    if (LOCAL_SET.has(norm(qRaw))) {
      return res.status(200).json({ ok: true, found: true, source: "local:nl", confidence: 100, vernacularName: qRaw });
    }

    // 2) GBIF suggest exact
    try {
      const g1 = await gbifSuggestExact(qRaw);
      if (g1) return res.status(200).json({ ok: true, found: true, ...g1 });
    } catch {}

    // 3) GBIF vernacularNames exact (nl/dut)
    try {
      const g2 = await gbifVernacularExact(qRaw);
      if (g2) return res.status(200).json({ ok: true, found: true, ...g2 });
    } catch {}

    // 4) Wikidata exact + taxon
    try {
      const w = await wikidataExact(qRaw);
      if (w) return res.status(200).json({ ok: true, found: true, ...w });
    } catch {}

    // No hit
    return res.status(200).json({ ok: true, found: false, source: "none", confidence: 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

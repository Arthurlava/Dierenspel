// /api/check-animal.js
// Exacte hele-woord match, maar spaties/streepjes/punctuatie genegeerd.
// Voorbeeld: "rode bosmier" == "rodebosmier" == "rode-bosmier"

function norm(s = "") {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")   // accents eruit
    .replace(/[^a-z0-9]/g, "");       // alles behalve letters/cijfers eruit (dus spaties/streepjes weg)
}
function exactEquals(a, b) { return norm(a) === norm(b); }

export default async function handler(req, res) {
  try {
    const qRaw = (req.query.name || "").trim();
    if (!qRaw) return res.status(400).json({ ok: false, error: "Missing ?name" });

    // 1) Wikipedia NL — exact titelmatch (na normalisatie zonder spaties/streepjes)
    try {
      const wiki = await fetch(
        `https://nl.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${encodeURIComponent(qRaw)}&srnamespace=0&srlimit=10`
      );
      if (wiki.ok) {
        const data = await wiki.json();
        const titles = (data.query?.search || []).map(x => x.title || "");
        const match = titles.find(t => exactEquals(t, qRaw));
        if (match) {
          return res.status(200).json({
            ok: true, found: true, source: "wikipedia:nl",
            title: match, url: `https://nl.wikipedia.org/wiki/${encodeURIComponent(match)}`
          });
        }
      }
    } catch {}

    // 2) GBIF suggest — exact op vernacular/canonical/scientific (spatie-onafhankelijk)
    try {
      const gbif = await fetch(`https://api.gbif.org/v1/species/suggest?q=${encodeURIComponent(qRaw)}&limit=25`);
      if (gbif.ok) {
        const items = await gbif.json();
        const hit = items.find(it =>
          exactEquals(it.vernacularName || "", qRaw) ||
          exactEquals(it.canonicalName  || "", qRaw) ||
          exactEquals(it.scientificName || "", qRaw)
        );
        if (hit) {
          return res.status(200).json({
            ok: true, found: true, source: "gbif",
            name: hit.vernacularName || hit.scientificName || qRaw,
            rank: hit.rank || "species"
          });
        }
      }
    } catch {}

    // 3) Wikidata — exact NL label/alias (spatie-onafhankelijk) + simpele taxon-check
    try {
      const wd = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(qRaw)}&language=nl&format=json&limit=25&origin=*`
      );
      if (wd.ok) {
        const w = await wd.json();
        const cand = (w.search || []).find(x =>
          exactEquals(x.label || "", qRaw) || (x.aliases || []).some(a => exactEquals(a, qRaw))
        );
        if (cand) {
          // optioneel korte taxon-check via wbgetentities (P225/P105/P171)
          try {
            const entResp = await fetch(
              `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${cand.id}&props=claims&format=json&origin=*`
            );
            if (entResp.ok) {
              const ent = await entResp.json();
              const claims = ent?.entities?.[cand.id]?.claims || {};
              const hasTaxon = (claims.P225?.length || claims.P105?.length || claims.P171?.length);
              if (hasTaxon) {
                return res.status(200).json({
                  ok: true, found: true, source: "wikidata",
                  label: cand.label, description: cand.description, url: cand.concepturi
                });
              }
            }
          } catch {}
        }
      }
    } catch {}

    // 4) Lokale lijst (uitbreidbaar) — ook spatie-onafhankelijk
    const localAnimals = [
      "hond","kat","geit","hamerhaai","rode bosmier","rode vuurmier","vos","egel","rups","mier","tor","zebra","leeuw","olifant","duif","muis","vleermuis"
    ];
    if (localAnimals.some(a => exactEquals(a, qRaw))) {
      return res.status(200).json({ ok: true, found: true, source: "local", name: qRaw });
    }

    // Niets gevonden
    return res.status(200).json({ ok: true, found: false });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

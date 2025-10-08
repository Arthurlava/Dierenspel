// /api/check-animal.js
function norm(s = "") {
  return s.toString().trim().toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function exactEquals(a, b) { return norm(a) === norm(b); }

export default async function handler(req, res) {
  try {
    const qRaw = (req.query.name || "").trim();
    if (!qRaw) return res.status(400).json({ ok: false, error: "Missing ?name" });
    const q = norm(qRaw);

    // 1️⃣ WIKIPEDIA API (Nederlandstalig)
    const wiki = await fetch(`https://nl.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${encodeURIComponent(qRaw)}&srnamespace=0&srlimit=5`);
    if (wiki.ok) {
      const wdata = await wiki.json();
      const titles = (wdata.query?.search || []).map(x => x.title || "");
      const match = titles.find(t => exactEquals(t, qRaw));
      if (match) {
        return res.status(200).json({
          ok: true,
          found: true,
          source: "wikipedia:nl",
          title: match,
          url: `https://nl.wikipedia.org/wiki/${encodeURIComponent(match)}`
        });
      }
    }

    // 2️⃣ GBIF API (wetenschappelijke soorten)
    const gbifUrl = `https://api.gbif.org/v1/species/suggest?q=${encodeURIComponent(qRaw)}&limit=15`;
    const gbif = await fetch(gbifUrl);
    if (gbif.ok) {
      const items = await gbif.json();
      const exact = items.find(it =>
        exactEquals(it.vernacularName || "", qRaw) ||
        exactEquals(it.canonicalName || "", qRaw) ||
        exactEquals(it.scientificName || "", qRaw)
      );
      if (exact) {
        return res.status(200).json({
          ok: true,
          found: true,
          source: "gbif",
          name: exact.vernacularName || exact.scientificName || qRaw,
          rank: exact.rank || "species"
        });
      }
    }

    // 3️⃣ WIKIDATA (NL labels)
    const wikidataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(qRaw)}&language=nl&format=json`;
    const wd = await fetch(wikidataUrl);
    if (wd.ok) {
      const wdata = await wd.json();
      const match = (wdata.search || []).find(x => exactEquals(x.label, qRaw));
      if (match) {
        return res.status(200).json({
          ok: true,
          found: true,
          source: "wikidata",
          label: match.label,
          description: match.description,
          url: match.concepturi
        });
      }
    }

    // 4️⃣ LOKALE FALLBACKLIJST (optioneel uitbreidbaar)
    const localAnimals = [
      "hond", "kat", "hamerhaai", "vos", "egel", "geit", "rups", "mier", "rode bosmier",
      "rode vuurmier", "zebra", "leeuw", "olifant", "duif", "muis", "vleermuis"
    ];
    if (localAnimals.some(a => exactEquals(a, qRaw))) {
      return res.status(200).json({
        ok: true,
        found: true,
        source: "local",
        name: qRaw
      });
    }

    return res.status(200).json({ ok: true, found: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

// api/check-animal.js
function norm(s = "") {
    return s.toString().trim().toLowerCase()
      .normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }
  function exactEquals(a, b) { return norm(a) === norm(b); }
  
  export default async function handler(req, res) {
    try {
      const qRaw = (req.query.name || "").trim();
      if (!qRaw) return res.status(400).json({ ok: false, error: "Missing ?name" });
  
      // 1) GBIF suggest — check alleen VOLLEDIGE exact matches
      const suggestUrl = "https://api.gbif.org/v1/species/suggest?q=" + encodeURIComponent(qRaw) + "&limit=25";
      const sResp = await fetch(suggestUrl, { headers: { accept: "application/json" } });
      if (sResp.ok) {
        const items = await sResp.json();
        const exact = items.find(it =>
          exactEquals(it.vernacularName || "", qRaw) ||
          exactEquals(it.canonicalName || "",  qRaw) ||
          exactEquals(it.scientificName || "", qRaw)
        );
        if (exact) {
          return res.status(200).json({
            ok: true,
            found: true,
            source: "gbif:suggest",
            confidence: 100,
            usageKey: exact.usageKey ?? null,
            scientificName: exact.scientificName ?? exact.canonicalName ?? null,
            vernacularName: exact.vernacularName ?? null,
            rank: exact.rank ?? null
          });
        }
      }
  
      // 2) GBIF match — alleen “gevonden” als NAAM exact gelijk aan scientific/canonical (dus géén “lijkt op”)
      const matchUrl = "https://api.gbif.org/v1/species/match?name=" + encodeURIComponent(qRaw);
      const mResp = await fetch(matchUrl, { headers: { accept: "application/json" } });
      if (mResp.ok) {
        const m = await mResp.json();
        const sci = m.scientificName || "";
        const can = m.canonicalName  || "";
        const exact = exactEquals(sci, qRaw) || exactEquals(can, qRaw);
        if (exact) {
          return res.status(200).json({
            ok: true,
            found: true,
            source: "gbif:match",
            confidence: m.confidence ?? 100,
            usageKey: m.usageKey ?? null,
            scientificName: m.scientificName ?? null,
            vernacularName: null,
            rank: m.rank ?? null
          });
        }
      }
  
      // Geen exacte match
      return res.status(200).json({ ok: true, found: false, source: "none", confidence: 0 });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  }
  
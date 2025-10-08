// api/check-animal.js
export default async function handler(req, res) {
    try {
      const name = (req.query.name || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "Missing ?name" });
  
      const url = "https://api.gbif.org/v1/species/match?name=" + encodeURIComponent(name);
      const r = await fetch(url, { headers: { "accept": "application/json" } });
      if (!r.ok) return res.status(502).json({ ok: false, error: "Upstream error", status: r.status });
  
      const json = await r.json();
      const confidence = json.confidence ?? 0;
      const found = json.matchType && json.matchType !== "NONE" && confidence >= 60;
  
      return res.status(200).json({
        ok: true,
        found,
        confidence,
        usageKey: json.usageKey ?? null,
        scientificName: json.scientificName ?? null,
        rank: json.rank ?? null,
        status: json.status ?? null
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  }
  
// api/check-animal.js
function norm(s = "") {
    return s
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
}

export default async function handler(req, res) {
    try {
        const qRaw = (req.query.name || "").trim();
        if (!qRaw) return res.status(400).json({ ok: false, error: "Missing ?name" });

        const q = norm(qRaw);

        // 1) GBIF suggest — vaak beter voor volksnamen (ook NL)
        const suggestUrl = "https://api.gbif.org/v1/species/suggest?q=" + encodeURIComponent(qRaw) + "&limit=10";
        const sResp = await fetch(suggestUrl, { headers: { accept: "application/json" } });
        if (sResp.ok) {
            const items = await sResp.json(); // [{scientificName, canonicalName, vernacularName, ...}]
            // Heuristiek: directe match op vernacularName of canonicalName (genormaliseerd)
            const hit = items.find(it => {
                const v = norm(it.vernacularName || "");
                const c = norm(it.canonicalName || "");
                const sci = norm(it.scientificName || "");
                return v === q || c === q || sci === q;
            }) || items[0];

            if (hit) {
                return res.status(200).json({
                    ok: true,
                    found: true,
                    source: "gbif:suggest",
                    confidence: hit.rank ? 90 : 70,
                    usageKey: hit.usageKey ?? null,
                    scientificName: hit.scientificName ?? hit.canonicalName ?? null,
                    vernacularName: hit.vernacularName ?? null,
                    rank: hit.rank ?? null
                });
            }
        }

        // 2) GBIF match — minder gevoelig voor taal
        const matchUrl = "https://api.gbif.org/v1/species/match?name=" + encodeURIComponent(qRaw);
        const mResp = await fetch(matchUrl, { headers: { accept: "application/json" } });
        if (mResp.ok) {
            const m = await mResp.json();
            const confidence = m.confidence ?? 0;
            const matchType = m.matchType || "NONE";
            const found = matchType !== "NONE" && confidence >= 60;
            return res.status(200).json({
                ok: true,
                found,
                source: "gbif:match",
                confidence,
                usageKey: m.usageKey ?? null,
                scientificName: m.scientificName ?? null,
                vernacularName: null,
                rank: m.rank ?? null
            });
        }

        // 3) Fallback — niets gevonden
        return res.status(200).json({ ok: true, found: false, source: "none", confidence: 0 });
    } catch (err) {
        return res.status(500).json({ ok: false, error: String(err) });
    }
}

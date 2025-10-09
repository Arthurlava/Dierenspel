// /api/check-animal.js
// Exacte hele-woord match (na normalisatie: spaties/streepjes/diacritics eruit)

function norm(s = "") {
    return s
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9]/g, "");
}
function exactEquals(a, b) { return norm(a) === norm(b); }
function isLongEnough(s) { return norm(s).length >= 2; }

export default async function handler(req, res) {
    try {
        const qRaw = (req.query.name || "").trim();
        if (!qRaw) return res.status(400).json({ ok: false, error: "Missing ?name" });

        // ❗ minimaal 2 tekens na normalisatie
        if (!isLongEnough(qRaw)) {
            return res.status(200).json({ ok: true, found: false, reason: "too_short" });
        }

        // 1) Lokale lijst — exact
        const localAnimals = [
            "hond", "kat", "geit", "hamerhaai", "rode bosmier", "rode vuurmier", "vos", "egel",
            "rups", "mier", "tor", "zebra", "leeuw", "olifant", "duif", "muis", "vleermuis", "os"
        ];
        if (localAnimals.some(a => exactEquals(a, qRaw))) {
            return res.status(200).json({ ok: true, found: true, source: "local", name: qRaw });
        }

        // 2) GBIF suggest — alleen EXACHTE gelijkheid, geen prefix/substring
        try {
            const gbif = await fetch(`https://api.gbif.org/v1/species/suggest?q=${encodeURIComponent(qRaw)}&limit=25`);
            if (gbif.ok) {
                const items = await gbif.json();
                const hit = items.find(it => {
                    const cands = [it.vernacularName, it.canonicalName, it.scientificName].filter(Boolean);
                    return cands.some(name => exactEquals(name, qRaw));
                });
                if (hit) {
                    return res.status(200).json({
                        ok: true, found: true, source: "gbif",
                        name: hit.vernacularName || hit.scientificName || qRaw,
                        rank: hit.rank || "species"
                    });
                }
            }
        } catch { }

        // 3) Wikidata — exact NL label/alias + simpele taxon-check
        try {
            const wd = await fetch(
                `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(qRaw)}&language=nl&format=json&limit=25&origin=*`
            );
            if (wd.ok) {
                const w = await wd.json();
                const cand = (w.search || []).find(x => {
                    const labelOk = x.label && exactEquals(x.label, qRaw);
                    const aliasOk = (x.aliases || []).some(a => exactEquals(a, qRaw));
                    return labelOk || aliasOk;
                });
                if (cand) {
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
                    } catch { }
                }
            }
        } catch { }

        // ❌ Geen exacte match in betrouwbare taxon-bronnen
        return res.status(200).json({ ok: true, found: false });
    } catch (err) {
        return res.status(500).json({ ok: false, error: String(err) });
    }
}

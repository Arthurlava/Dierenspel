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

        // 1) Lokale lijst — EXACHT
        const localAnimals = [
            "hond", "kat", "geit", "hamerhaai", "rode bosmier", "rode vuurmier", "vos", "egel",
            "rups", "mier", "tor", "zebra", "leeuw", "olifant", "duif", "muis", "vleermuis", "os"
        ];
        const localHit = localAnimals.find(a => exactEquals(a, qRaw));
        if (localHit) {
            return res.status(200).json({
                ok: true, found: true, source: "local",
                matchedName: localHit, matchedKind: "vernacular"
            });
        }

        // 2) GBIF — alleen EXACHTE gelijkheid (geen prefix/substring)
        try {
            const gbif = await fetch(`https://api.gbif.org/v1/species/suggest?q=${encodeURIComponent(qRaw)}&limit=25`);
            if (gbif.ok) {
                const items = await gbif.json();
                const hit = items.find(it =>
                    (it.vernacularName && exactEquals(it.vernacularName, qRaw)) ||
                    (it.scientificName && exactEquals(it.scientificName, qRaw)) ||
                    (it.canonicalName && exactEquals(it.canonicalName, qRaw))
                );
                if (hit) {
                    let matchedName = null, matchedKind = null;
                    if (hit.vernacularName && exactEquals(hit.vernacularName, qRaw)) { matchedName = hit.vernacularName; matchedKind = "vernacular"; }
                    else if (hit.scientificName && exactEquals(hit.scientificName, qRaw)) { matchedName = hit.scientificName; matchedKind = "scientific"; }
                    else if (hit.canonicalName && exactEquals(hit.canonicalName, qRaw)) { matchedName = hit.canonicalName; matchedKind = "canonical"; }

                    return res.status(200).json({
                        ok: true, found: true, source: "gbif",
                        matchedName, matchedKind, rank: hit.rank || "species"
                    });
                }
            }
        } catch { }

        // 3) Wikidata — EXACHT NL label/alias + taxon-claims
        try {
            const wd = await fetch(
                `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(qRaw)}&language=nl&format=json&limit=25&origin=*`
            );
            if (wd.ok) {
                const w = await wd.json();
                const cand = (w.search || []).find(x =>
                    (x.label && exactEquals(x.label, qRaw)) ||
                    (x.aliases || []).some(a => exactEquals(a, qRaw))
                );
                if (cand) {
                    // simpele taxon-check
                    try {
                        const entResp = await fetch(
                            `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${cand.id}&props=claims&format=json&origin=*`
                        );
                        if (entResp.ok) {
                            const ent = await entResp.json();
                            const claims = ent?.entities?.[cand.id]?.claims || {};
                            const hasTaxon = (claims.P225?.length || claims.P105?.length || claims.P171?.length);
                            if (hasTaxon) {
                                const matchedName =
                                    (cand.label && exactEquals(cand.label, qRaw)) ? cand.label :
                                        (cand.aliases || []).find(a => exactEquals(a, qRaw)) || qRaw;

                                return res.status(200).json({
                                    ok: true, found: true, source: "wikidata",
                                    matchedName, matchedKind: (cand.label === matchedName ? "label" : "alias"),
                                    url: cand.concepturi
                                });
                            }
                        }
                    } catch { }
                }
            }
        } catch { }

        // ❌ Geen exacte match
        return res.status(200).json({ ok: true, found: false });
    } catch (err) {
        return res.status(500).json({ ok: false, error: String(err) });
    }
}

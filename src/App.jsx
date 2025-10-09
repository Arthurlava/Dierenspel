async function checkAnimalViaAPI() {
    const q = (answer || "").trim();
    if (!q) { setApiState({ status: "idle", msg: "" }); return; }

    // Client-guard: minimaal 2 tekens na normalisatie
    let cleaned = q.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "");
    if (cleaned.length < 2) {
        setApiState({ status: "notfound", msg: "Voer minimaal 2 tekens in" });
        return;
    }

    try {
        setApiState({ status: "checking", msg: "Bezig met controleren…" });
        const resp = await fetch(`/api/check-animal?name=${encodeURIComponent(q)}`, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!resp.ok) {
            const text = await resp.text().catch(() => "");
            setApiState({ status: "error", msg: `API error (${resp.status}) ${text}` });
            return;
        }

        const data = await resp.json();
        if (data?.ok && data?.found) {
            const displayName = data.matchedName || data.name || data.label || q;
            const src = (data.source || "api").toUpperCase();
            setApiState({ status: "ok", msg: `✅ Dier gevonden: ${displayName} — bron: ${src}` });
        } else {
            setApiState({ status: "notfound", msg: "ℹ️ Niet gevonden (exacte naam vereist)" });
        }
    } catch (err) {
        setApiState({ status: "error", msg: `Netwerkfout: ${String(err)}` });
    }
}

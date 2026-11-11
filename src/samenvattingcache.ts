// Cache van video-samenvattingen, los van feed.tsx zodat het hoofdscherm ze kan zaaien zonder de spelerchunk te laden.
export type Sv = { ok: true; punten: string[]; bron: "ondertiteling" | "spraak"; sec?: number; model?: string; neuronen?: number; cached?: boolean } | { ok: false; code: string; fout: string };
export const svCache = new Map<string, Sv>();
/** Vooraf gemaakte samenvattingen uit /data.json in de cache zetten (knop toont dan "klaar"). Een nieuwe geldige vervangt een oudere; identieke blijft ongemoeid, een ongeldige wist niets. */
export function zaaiSamenvattingen(m?: Record<string, { punten: string[]; bron: "ondertiteling" | "spraak"; sec?: number }>) {
  for (const [id, x] of Object.entries(m || {})) {
    if (!Array.isArray(x?.punten) || !x.punten.length || !x.punten.every((p) => typeof p === "string" && p.trim())) continue;
    if (x.bron !== "ondertiteling" && x.bron !== "spraak") continue;
    const oud = svCache.get(id);
    if (oud?.ok && oud.bron === x.bron && oud.sec === x.sec && oud.punten.length === x.punten.length && oud.punten.every((p, i) => p === x.punten[i])) continue;
    svCache.set(id, { ok: true, punten: x.punten, bron: x.bron, sec: x.sec, cached: true });
  }
}

// Wacht `ms`, maar stopt direct (met AbortError) als het signaal afgaat; de timer wordt dan ook opgeruimd.
function wacht(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((ok, nee) => {
    if (signal.aborted) return nee(new DOMException("Afgebroken", "AbortError"));
    const t = setTimeout(() => { signal.removeEventListener("abort", af); ok(); }, ms);
    const af = () => { clearTimeout(t); nee(new DOMException("Afgebroken", "AbortError")); };
    signal.addEventListener("abort", af, { once: true });
  });
}
// POST /samenvatting met hooguit 8 pogingen bij "bezig". Afbreken (blad dicht) stopt aanvraag én wachttijd: de belofte wordt afgewezen.
export async function haalSamenvatting(id: string, signal: AbortSignal): Promise<Sv> {
  const hit = svCache.get(id);
  if (hit) return hit;
  for (let poging = 0; poging < 8; poging++) {
    let r: Response;
    try {
      r = await fetch("/samenvatting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal });
    } catch (e) {
      if (signal.aborted) throw e;
      return { ok: false, code: "net", fout: "Geen verbinding. Check je internet en probeer het nog eens." };
    }
    const j = (await r.json().catch(() => null)) as Sv | null;
    if (signal.aborted) throw new DOMException("Afgebroken", "AbortError");
    if (j && !j.ok && j.code === "bezig") { await wacht(4000, signal); continue; }
    if (!j) return { ok: false, code: "fout", fout: "Samenvatten lukt even niet. Probeer het later nog eens." };
    if (j.ok || ["geen-tekst", "te-lang", "onbekend"].includes(j.code)) svCache.set(id, j);
    return j;
  }
  return { ok: false, code: "fout", fout: "Het duurt te lang. Probeer het zo nog eens." };
}

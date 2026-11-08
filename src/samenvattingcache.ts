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

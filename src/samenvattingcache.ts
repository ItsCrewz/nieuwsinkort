// Cache van video-samenvattingen, los van feed.tsx zodat het hoofdscherm ze kan zaaien zonder de spelerchunk te laden.
export type Sv = { ok: true; punten: string[]; bron: "ondertiteling" | "spraak"; sec?: number; model?: string; neuronen?: number; cached?: boolean } | { ok: false; code: string; fout: string };
export const svCache = new Map<string, Sv>();
/** Vooraf gemaakte samenvattingen uit /data.json in de cache zetten (knop toont dan "klaar"). */
export function zaaiSamenvattingen(m?: Record<string, { punten: string[]; bron: "ondertiteling" | "spraak"; sec?: number }>) {
  for (const [id, x] of Object.entries(m || {})) if (Array.isArray(x?.punten) && x.punten.length && !svCache.has(id)) svCache.set(id, { ok: true, punten: x.punten, bron: x.bron, sec: x.sec, cached: true });
}

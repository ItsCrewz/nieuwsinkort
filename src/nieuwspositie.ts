// De oude volgorde bewaart ook een uitwijkpunt als een bericht verdwijnt.
export type Nieuwspositie = { id: string | null; offset: number; volgorde: string[]; nieuw: string[] };
const prefix = "nieuwsinkort-nieuwspositie:";

export function leesNieuwspositie(tab: string): Nieuwspositie | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(prefix + tab) || "null");
    return p && (p.id === null || typeof p.id === "string") && Number.isFinite(p.offset) && Array.isArray(p.volgorde) && Array.isArray(p.nieuw) ? p : null;
  } catch { return null; }
}
export function bewaarNieuwspositie(tab: string, p: Nieuwspositie) {
  try { sessionStorage.setItem(prefix + tab, JSON.stringify(p)); } catch { /* opslag kan uitstaan */ }
}
export function herstelNieuwspositie(p: Nieuwspositie, ids: string[]): { id: string | null; nieuw: string[] } {
  if (!p.id) return { id: null, nieuw: [] };
  const oudIndex = p.volgorde.indexOf(p.id);
  const id = ids.includes(p.id) ? p.id : p.volgorde.slice(Math.max(0, oudIndex + 1)).find((x) => ids.includes(x)) ?? null;
  const grens = id ? ids.indexOf(id) : 0;
  const bekend = new Set(p.volgorde);
  const nieuw = new Set([...p.nieuw, ...ids.slice(0, grens).filter((x) => !bekend.has(x))]);
  return { id, nieuw: ids.filter((x) => nieuw.has(x)) };
}

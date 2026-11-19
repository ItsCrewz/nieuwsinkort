// Extra tekst per bericht (/meer), apart zodat de lijst kan voorladen zonder het detailscherm (eigen chunk) te laden.
import { useEffect, useState } from "react";
import type { Item, Meer } from "./types";
import { verzamelUrl } from "./puntenrelevantie";

// Verdieping alleen tonen als de sleutel van de state bij het huidige item hoort (#646); anders laden, zonder sleutel niets.
export type MeerState = { k?: string; meer: Meer | null; laden: boolean; fout?: boolean };
export function meerVoor(st: MeerState, k: string | undefined): { meer: Meer | null; laden: boolean; fout: boolean } {
  if (!k) return { meer: null, laden: false, fout: false };
  return st.k === k ? { meer: st.meer, laden: st.laden, fout: !!st.fout && !st.laden } : { meer: null, laden: true, fout: false };
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const tekstlijst = (v: unknown): v is string[] => Array.isArray(v) && v.every((p) => typeof p === "string");
function geldigMeer(v: unknown): v is Meer {
  if (!object(v) || !("uitleg" in v || "perBron" in v || "uittreksel" in v)) return false;
  const bronnen = (lijst: unknown, veld: "punten" | "alineas") => Array.isArray(lijst) && lijst.every((b) =>
    object(b) && typeof b.site === "string" && typeof b.href === "string" && tekstlijst(b[veld]));
  return (v.uitleg === undefined || tekstlijst(v.uitleg))
    && (v.perBron === undefined || bronnen(v.perBron, "punten"))
    && (v.uittreksel === undefined || bronnen(v.uittreksel, "alineas"));
}

// Per sessie bewaard, maar na VERS ms hervalideerd (#840): de server kan de verdieping onder dezelfde sleutel wijzigen.
// Eén aanvraag tegelijk per sleutel; een mislukte verversing houdt het laatste geldige antwoord en probeert later opnieuw.
const VERS = 5 * 60e3;
type Ingang = { p: Promise<Meer | null>; at: number; data: Meer | null; bezig: boolean };
const meerCache = new Map<string, Ingang>();
// Beloftes van aanvragen die echt mislukten (netwerk, serverfout, ongeldig antwoord, timeout); een 404 is geen fout: er is dan geen verdieping.
const mislukt = new WeakSet<Promise<Meer | null>>();
export const meerMislukt = (p: Promise<Meer | null>): boolean => mislukt.has(p);
// Cache begrenzen (#1035, #1082): minst recent gebruikte ingangen die niet bezig zijn gaan eruit; Map-volgorde = gebruiksvolgorde.
function raak(k: string, ing: Ingang): void { meerCache.delete(k); meerCache.set(k, ing); }
function begrens(): void {
  for (const [sl, ing] of meerCache) {
    if (meerCache.size <= MAX_CACHE) break;
    if (!ing.bezig) meerCache.delete(sl);
  }
}
export function prefetchMeer(item: Item): Promise<Meer | null> {
  const k = item.meer;
  if (!k || item.bronnen?.some((b) => verzamelUrl(b.href))) return Promise.resolve(null);
  const e = meerCache.get(k);
  if (e && (e.bezig || Date.now() - e.at < VERS)) { raak(k, e); return e.p; }
  const nieuw: Ingang = { p: Promise.resolve(null), at: e?.at ?? 0, data: e?.data ?? null, bezig: true };
  // Een vastgelopen aanvraag stopt na 10 s (#742), zodat een volgende poging kan herstellen.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  type Uitslag = { m: Meer | null; fout: boolean };
  const timeout = new Promise<Uitslag>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve({ m: null, fout: true }); }, 10000);
  });
  const aanvraag: Promise<Uitslag> = fetch(`/meer?k=${encodeURIComponent(k)}`, { cache: "no-cache", signal: controller.signal })
    .then(async (r): Promise<Uitslag> => {
      if (r.status === 404) return { m: null, fout: false };
      if (!r.ok) return { m: null, fout: true };
      const data = await r.json() as unknown;
      return geldigMeer(data) ? { m: data, fout: false } : { m: null, fout: true };
    })
    .catch((): Uitslag => ({ m: null, fout: true }));
  nieuw.p = Promise.race([aanvraag, timeout]).then(({ m, fout }) => {
    clearTimeout(timer);
    nieuw.bezig = false;
    if (fout && !nieuw.data) mislukt.add(nieuw.p); // met een eerder geldig antwoord blijft dat staan
    if (m) { nieuw.data = m; nieuw.at = Date.now(); } else if (!nieuw.data && meerCache.get(k) === nieuw) meerCache.delete(k);
    if (meerCache.get(k) === nieuw) raak(k, nieuw); // alleen als deze aanvraag nog de actuele ingang is
    begrens(); // ook na afronding: bij een piek van lopende aanvragen blijft de cache anders te groot
    return m ?? nieuw.data;
  });
  raak(k, nieuw);
  begrens();
  return nieuw.p;
}

// Speculatief voorladen bij hover (#1035): geen wachtrij, een aanvraag die niet mag wordt weggegooid.
// Expliciet openen (prefetchMeer) kijkt hier niet naar en loopt dus nooit vast.
const MAX_CACHE = 50, MAX_SPEC = 2, SPEC_PAUZE = 400;
let specBezig = 0, specLaatst = -Infinity;
export function voorlaadMeer(item: Item): void {
  const k = item.meer;
  if (!k || specBezig >= MAX_SPEC) return;
  const e = meerCache.get(k);
  if (e && (e.bezig || Date.now() - e.at < VERS)) return;
  const nu = Date.now();
  if (nu - specLaatst < SPEC_PAUZE) return;
  specLaatst = nu;
  specBezig++;
  void prefetchMeer(item).finally(() => { specBezig--; });
}

export function useMeer(item: Item): { meer: Meer | null; laden: boolean; fout: boolean; opnieuw: () => void } {
  const [st, setSt] = useState<MeerState>({ meer: null, laden: !!item.meer });
  const [poging, setPoging] = useState(0);
  useEffect(() => {
    let weg = false;
    if (!item.meer) { setSt({ meer: null, laden: false }); return; }
    setSt({ k: item.meer, meer: null, laden: true });
    const p = prefetchMeer(item);
    p.then((m) => { if (!weg) setSt({ k: item.meer, meer: m, laden: false, fout: !m && meerMislukt(p) }); });
    return () => { weg = true; };
  }, [item, poging]);
  const opnieuw = () => setPoging((n) => n + 1);
  return { ...meerVoor(st, item.meer), opnieuw };
}

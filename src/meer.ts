// Extra tekst per bericht (/meer), apart zodat de lijst kan voorladen zonder het detailscherm (eigen chunk) te laden.
import type { Item, Meer } from "./types";
import { verzamelUrl } from "./puntenrelevantie";

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
export function prefetchMeer(item: Item): Promise<Meer | null> {
  const k = item.meer;
  if (!k || item.bronnen?.some((b) => verzamelUrl(b.href))) return Promise.resolve(null);
  const e = meerCache.get(k);
  if (e && (e.bezig || Date.now() - e.at < VERS)) return e.p;
  const nieuw: Ingang = { p: Promise.resolve(null), at: e?.at ?? 0, data: e?.data ?? null, bezig: true };
  nieuw.p = fetch(`/meer?k=${encodeURIComponent(k)}`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() as Promise<unknown> : null))
    .then((data) => geldigMeer(data) ? data : null)
    .catch(() => null)
    .then((m) => {
      nieuw.bezig = false;
      if (m) { nieuw.data = m; nieuw.at = Date.now(); } else if (!nieuw.data && meerCache.get(k) === nieuw) meerCache.delete(k);
      return m ?? nieuw.data;
    });
  meerCache.set(k, nieuw);
  return nieuw.p;
}

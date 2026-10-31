// Publicatietijden en de Amsterdamse dag voor Worker en Pages.
import { ams, midnight } from "./tijd";

export const TOEKOMST_MARGE = 15 * 60e3;
export const TZ_MARGE = 2 * 3600e3 + TOEKOMST_MARGE;
export function publicatieTijd(d: number | null | undefined, now: number): number | null {
  if (d == null || !Number.isFinite(d) || d > now + TZ_MARGE) return null;
  return d > now + TOEKOMST_MARGE ? now : d;
}
export function vanVandaag(d: number | null | undefined, now: number) {
  const t = publicatieTijd(d, now);
  return t != null && t >= midnight(now);
}
export const nieuwsteTijd = (leden: { d: number }[]) => Math.max(...leden.map((lid) => lid.d));

export function alleenVandaag(data: any, now: number) {
  if (!data || typeof data !== "object") return data;
  const gen = Date.parse(data.gegenereerd || "");
  const vandaag = Number.isFinite(gen) && ams(gen).iso === ams(now).iso;
  const grens = vandaag ? ams(gen).h * 60 + ams(gen).min + 20 : 0;
  const dagBegin = vandaag ? midnight(now) : 0;
  const oud = { items: 0, filmpjes: 0, dumpert: 0 };
  const out = { ...data, oud };
  for (const key of ["items", "filmpjes", "dumpert"] as const) {
    const lijst = Array.isArray(data[key]) ? data[key] : [];
    out[key] = lijst.filter((x: any) => {
      let keep = false;
      if (vandaag && x && Object.prototype.hasOwnProperty.call(x, "t")) { const t = publicatieTijd(x.t, now); keep = t != null && t >= dagBegin; }
      else if (vandaag) {
        const m = /^(\d{2}):(\d{2})$/.exec(x?.tijd || "");
        keep = !!m && +m[1] < 24 && +m[2] < 60 && +m[1] * 60 + +m[2] <= grens;
      }
      if (!keep) oud[key]++;
      return keep;
    });
  }
  if (!vandaag) out.dag_samenvatting = "";
  return out;
}

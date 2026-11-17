// Publicatietijden en de Amsterdamse dag voor Worker en Pages.
import { ams, amsTijdstip, midnight } from "./tijd";

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
// Voor video geldt de vorige Amsterdamse kalenderdag tot 10:00 als terugval.
export function videoVanaf(now: number) {
  const begin = midnight(now);
  return ams(now).h < 10 ? midnight(begin - 1) : begin;
}
export function selecteerVideodag<T extends object>(lijst: T[], now: number, tijd: (v: T) => number | null | undefined): (T & { gisteren?: boolean })[] {
  const vandaag = lijst.filter((v) => vanVandaag(tijd(v), now));
  if (vandaag.length) return vandaag;
  if (ams(now).h >= 10) return [];
  const begin = midnight(now), vorig = videoVanaf(now);
  return lijst.filter((v) => { const t = publicatieTijd(tijd(v), now); return t != null && t >= vorig && t < begin; }).map((v) => ({ ...v, gisteren: true }));
}
// Ontbreekt een numerieke t, dan volgt die uit de dag van de dataset en een geldige HH:MM (anders null).
export function afgeleideTijd(x: any, gen: number): number | null {
  if (typeof x?.t === "number") return x.t;
  if (x?.t != null || !Number.isFinite(gen)) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(x?.tijd || "");
  return m && +m[1] < 24 && +m[2] < 60 ? amsTijdstip(gen, +m[1], +m[2]) : null;
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
    const gefilterd = lijst.filter((x: any) => {
      let keep = false;
      if (key !== "items" && x?.gisteren) { oud[key]++; return false; }
      if (vandaag && x && Object.prototype.hasOwnProperty.call(x, "t")) { const t = publicatieTijd(x.t, now); keep = t != null && t >= dagBegin; }
      else if (vandaag) {
        const m = /^(\d{2}):(\d{2})$/.exec(x?.tijd || "");
        keep = !!m && +m[1] < 24 && +m[2] < 60 && +m[1] * 60 + +m[2] <= grens;
      }
      if (!keep) oud[key]++;
      return keep;
    });
    if (key === "items") out[key] = gefilterd;
    else {
      const genGisteren = Number.isFinite(gen) && ams(gen).iso === ams(midnight(now) - 1).iso;
      const tijd = (x: any) => afgeleideTijd(x, gen);
      const video = vandaag ? selecteerVideodag(lijst, now, tijd) : genGisteren ? selecteerVideodag(lijst.filter((x: any) => !vanVandaag(tijd(x), now)), now, tijd) : [];
      out[key] = gefilterd.length ? gefilterd.filter((x: any) => !x.gisteren) : video;
      oud[key] = lijst.length - out[key].length;
    }
  }
  if (!vandaag) out.dag_samenvatting = "";
  return out;
}

/** Houd de huidige data alleen als de hele respons inhoudelijk gelijk is (geen onnodige state-update); dezelfde `gegenereerd` verbergt dus geen gewijzigde artikelen, briefing of weer. */
export function kiesNieuweData<T extends { gegenereerd?: string }>(vorig: T | null, nieuw: T): T {
  return vorig && vorig.gegenereerd && vorig.gegenereerd === nieuw.gegenereerd && JSON.stringify(vorig) === JSON.stringify(nieuw) ? vorig : nieuw;
}

export function verwijderGisteren<T extends { filmpjes?: { gisteren?: boolean }[]; dumpert?: { gisteren?: boolean }[] }>(data: T, now: number): T {
  if (ams(now).h < 10) return data;
  const filmpjes = data.filmpjes?.filter((v) => !v.gisteren), dumpert = data.dumpert?.filter((v) => !v.gisteren);
  return filmpjes?.length === data.filmpjes?.length && dumpert?.length === data.dumpert?.length ? data : { ...data, filmpjes, dumpert };
}

// Eerstvolgende 10:00 Amsterdam na `now` (ook op zomer-/wintertijdwisseldagen).
export function volgende10(now: number): number {
  const vandaag = amsTijdstip(now, 10, 0);
  if (vandaag != null && vandaag > now) return vandaag;
  return amsTijdstip(midnight(now) + 36 * 3600e3, 10, 0) as number;
}
export const heeftGisteren = (data: any) => ["filmpjes", "dumpert"].some((k) => Array.isArray(data?.[k]) && data[k].some((v: any) => v?.gisteren));
// Hoe lang (ms) een respons met deze data gecachet mag blijven: zonder gisteren-video's onbegrensd, anders tot 10:00.
export const videoCacheMs = (data: any, now: number) => heeftGisteren(data) ? volgende10(now) - now : Infinity;

const MAX_TIMER = 2 ** 31 - 1;
export interface GrensOmgeving {
  nu?: () => number;
  setT?: (f: () => void, ms: number) => unknown;
  clearT?: (id: unknown) => void;
  doc?: { visibilityState?: string; addEventListener: (n: string, f: () => void) => void; removeEventListener: (n: string, f: () => void) => void };
  win?: { addEventListener: (n: string, f: () => void) => void; removeEventListener: (n: string, f: () => void) => void };
}
/** Eén timer op de eerstvolgende 10:00 Amsterdam i.p.v. een controle per seconde; `ruim` verwijdert de gisteren-items. Plant opnieuw na een klokwisseling en ruimt direct op bij terugkeer in het tabblad. Geeft de opruimfunctie terug. */
export function bewaakGrens(ruim: () => void, o: GrensOmgeving = {}): () => void {
  const nu = o.nu ?? Date.now, setT = o.setT ?? ((f, ms) => setTimeout(f, ms)), clearT = o.clearT ?? ((id) => clearTimeout(id as any));
  const g = globalThis as any; // geen dom-lib in de Worker-tsconfig; daar zijn document/window undefined
  const doc: GrensOmgeving["doc"] = o.doc ?? g.document, win: GrensOmgeving["win"] = o.win ?? g.window;
  let id: unknown, weg = false;
  const plan = () => {
    if (id != null) clearT(id);
    id = setT(tik, Math.min(Math.max(volgende10(nu()) - nu(), 0), MAX_TIMER));
  };
  const tik = () => { if (weg) return; ruim(); plan(); };
  const terug = () => { if (!weg && doc?.visibilityState !== "hidden") tik(); };
  doc?.addEventListener("visibilitychange", terug);
  win?.addEventListener("focus", terug);
  tik();
  return () => { weg = true; if (id != null) clearT(id); doc?.removeEventListener("visibilitychange", terug); win?.removeEventListener("focus", terug); };
}

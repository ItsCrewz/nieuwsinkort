// Filters voor het nieuws (en tijd voor de filmpjes). Eén klein onderblad, alles onthouden in localStorage.
// Tijd staat standaard op "Automatisch": "Sinds je laatste bezoek" als er sindsdien genoeg nieuw is, anders "Vandaag".
import { useCallback, useEffect, useState } from "react";
import type { Cat, Item, Video } from "./types";
import { midnight } from "./tijd";
import { BUITEN_WOORD } from "./regio";
import { Icon } from "./icons";

export type Tijd = "auto" | "sinds" | "vandaag" | "1u" | "3u" | "alles";
export type Regio = "haarlem" | "nl" | "wereld";
export type Filters = { tijd: Tijd; cats: Cat[]; video: boolean; samen: boolean; regio: Regio[]; sort: "nieuw" | "oud" | "bronnen" };
const KEY = "nieuwsinkort-filters";
const BEZOEK = "nieuwsinkort-laatste-bezoek";
const BEZOEK_SESSIE = "nieuwsinkort-bezoek-ref";
const GENOEG = 5; // zoveel nieuwe berichten sinds je laatste bezoek = automatisch "Sinds je laatste bezoek"
export const STANDAARD: Filters = { tijd: "auto", cats: [], video: false, samen: false, regio: [], sort: "nieuw" };

export const TIJD_LABEL: Record<Exclude<Tijd, "auto">, string> = { sinds: "Sinds je laatste bezoek", vandaag: "Vandaag", "1u": "Laatste uur", "3u": "Laatste 3 uur", alles: "Alles" };
export const REGIO_LABEL: Record<Regio, string> = { haarlem: "Haarlem", nl: "Nederland", wereld: "Wereld" };
export const CAT_OPT: { id: Cat; label: string }[] = [
  { id: "nl", label: "Nederland" },
  { id: "buitenland", label: "Buitenland" },
  { id: "politiek", label: "Politiek" },
  { id: "voetbal", label: "Voetbal" },
  { id: "f1", label: "Formule 1" },
  { id: "auto", label: "Auto" },
  { id: "tech", label: "Tech & AI" },
  { id: "haarlem", label: "Haarlem" },
  { id: "showbizz", label: "Showbizz" },
];

function lees(): Filters {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "null");
    if (j && typeof j === "object") return { ...STANDAARD, ...j, cats: Array.isArray(j.cats) ? j.cats : [], regio: Array.isArray(j.regio) ? j.regio : [] };
  } catch {
    /* privémodus */
  }
  return STANDAARD;
}

/** Vorig bezoek: bij de start van een sessie gelezen (en vastgehouden zolang het tabblad open is), daarna "nu" opgeslagen. */
function vorigBezoek(): number {
  try {
    const ref = sessionStorage.getItem(BEZOEK_SESSIE);
    if (ref != null) return +ref || 0;
    const prev = +(localStorage.getItem(BEZOEK) || 0) || 0;
    sessionStorage.setItem(BEZOEK_SESSIE, String(prev));
    return prev;
  } catch {
    return 0;
  }
}
function bewaarBezoek() {
  try {
    localStorage.setItem(BEZOEK, String(Date.now()));
  } catch {
    /* negeer */
  }
}

export function useFilters() {
  const [f, setF] = useState<Filters>(lees);
  const [vorig] = useState(vorigBezoek);
  useEffect(() => {
    bewaarBezoek();
    const onHide = () => document.visibilityState === "hidden" && bewaarBezoek();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);
  const set = useCallback((p: Partial<Filters>) => {
    setF((o) => {
      const n = { ...o, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(n));
      } catch {
        /* negeer */
      }
      return n;
    });
  }, []);
  const reset = useCallback(() => set(STANDAARD), [set]);
  return { f, set, reset, vorig };
}

// ------------------------------------------------------------- tijd
// Berichten hebben alleen "HH:MM" (Amsterdam); gegenereerd bepaalt de referentiedag.
// Tot 20 minuten vooruit blijft op die dag, zodat de toekomstmarge van de Worker past.
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const minVan = (d: Date) => {
  const [h, m] = fmt.format(d).split(":").map(Number);
  return h * 60 + m;
};
export function tijdstip(hhmm: string | undefined, gen: number): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  const t = +m[1] * 60 + +m[2];
  const g = new Date(gen);
  const gm = minVan(g);
  let ts = gen - g.getSeconds() * 1000 - g.getMilliseconds() - (gm - t) * 60e3;
  if (t > gm + 20) ts -= 86400e3;
  return ts;
}
function vanafVoor(t: Exclude<Tijd, "auto">, vorig: number): number {
  const now = Date.now();
  if (t === "1u") return now - 3600e3;
  if (t === "3u") return now - 3 * 3600e3;
  if (t === "sinds") return vorig || 0;
  if (t === "vandaag") return midnight(now);
  return -Infinity;
}
const genVan = (gen?: string) => Date.parse(gen || "") || Date.now();

// ------------------------------------------------------------- regio / video / samengevoegd
const BUITEN_SITE = /techcrunch|the verge|ars technica|wired|mit technology|hacker news|engadget|bleeping|reuters|bbc|guardian/i;
const BUITEN_URL = /\/(buitenland|world|wereld|internationaal|international)\//i;
const HAARLEM = /haarlem|bloemendaal|heemstede|zandvoort|velsen|ijmuiden|kennemerland|spaarndam|schalkwijk/i;
export function regioVan(it: Item): Regio {
  const tekst = `${it.kop} ${it.ai || ""} ${it.samenvatting || ""}`;
  if (it.cat === "haarlem" || HAARLEM.test(tekst)) return "haarlem";
  if (it.cat === "buitenland") return "wereld";
  const b = it.bronnen || [];
  if (b.some((x) => BUITEN_SITE.test(x.site) || BUITEN_URL.test(x.href)) || BUITEN_WOORD.test(`${it.kop} ${it.ai || ""}`)) return "wereld";
  return "nl";
}
const VIDEO_URL = /\/video\/|\/video-|\/videos?\/|youtube\.com|youtu\.be|\.mp4\b|\/kijk\/|\/tv\//i;
export const heeftVideo = (it: Item) => (it.bronnen || []).some((b) => VIDEO_URL.test(b.href));
export const sites = (it: Item) => new Set((it.bronnen || []).map((b) => b.site)).size;
export const samengevoegd = (it: Item) => (it.bronnen || []).length > 1;

/** Alles behalve tijd (tijd wordt apart bepaald, want "Automatisch" hangt af van wat er overblijft). */
function zonderTijd(items: Item[], f: Filters, alles: boolean) {
  return items.filter(
    (it) =>
      (!alles || !f.cats.length || f.cats.includes(it.cat)) &&
      (!f.video || heeftVideo(it)) &&
      (!f.samen || samengevoegd(it)) &&
      (!f.regio.length || f.regio.includes(regioVan(it)))
  );
}
export type Uitkomst = { items: Item[]; tijd: Exclude<Tijd, "auto">; auto: boolean; per: Record<Exclude<Tijd, "auto">, number>; nieuwSinds: number };
export const TIJDEN: Exclude<Tijd, "auto">[] = ["sinds", "vandaag", "3u", "1u", "alles"];
export function filterNieuws(items: Item[], f: Filters, vorig: number, gen: string | undefined, alles: boolean): Uitkomst {
  const g = genVan(gen);
  const basis = zonderTijd(items, f, alles);
  const ts = basis.map((it) => tijdstip(it.tijd, g));
  const tel = (t: Exclude<Tijd, "auto">) => {
    if (t === "alles") return basis.length;
    if (t === "sinds" && !vorig) return basis.length;
    const v = vanafVoor(t, vorig);
    return ts.filter((x) => x == null || x >= v).length; // zonder tijd: altijd tonen
  };
  const per = Object.fromEntries(TIJDEN.map((t) => [t, tel(t)])) as Uitkomst["per"];
  let tijd: Exclude<Tijd, "auto">;
  const auto = f.tijd === "auto";
  if (auto) {
    // Sinds je laatste bezoek alleen als dat bezoek <24 u geleden was, er genoeg nieuw is en het echt minder is dan alles.
    const vandaagVanaf = vanafVoor("vandaag", vorig);
    // Net na middernacht is er nog bijna niets van "vandaag": dan Alles (het nieuws van gisteren).
    const vandaagMetTijd = ts.filter((x) => x != null && x >= vandaagVanaf).length;
    const sindsMetTijd = vorig ? ts.filter((x) => x != null && x >= vorig).length : 0;
    const metTijd = ts.filter((x) => x != null).length;
    tijd = vorig && Date.now() - vorig < 24 * 3600e3 && sindsMetTijd >= GENOEG && sindsMetTijd < metTijd ? "sinds" : vandaagMetTijd >= GENOEG ? "vandaag" : "alles";
  } else tijd = f.tijd as Exclude<Tijd, "auto">;
  const vanaf = tijd === "sinds" && !vorig ? -Infinity : vanafVoor(tijd, vorig);
  const out = basis
    .map((item, i) => ({ item, ts: ts[i] }))
    .filter(({ ts }) => ts == null || ts >= vanaf)
    .sort((a, b) => {
      if (f.sort === "bronnen") {
        const verschil = sites(b.item) - sites(a.item);
        if (verschil) return verschil;
      }
      // Zonder tijd onderaan; gelijke tijden behouden hun oorspronkelijke volgorde.
      if (a.ts == null) return b.ts == null ? 0 : 1;
      if (b.ts == null) return -1;
      return f.sort === "oud" ? a.ts - b.ts : b.ts - a.ts;
    })
    .map(({ item }) => item);
  return { items: out, tijd, auto, per, nieuwSinds: vorig ? per.sinds : 0 };
}
/** Filmpjes: alleen het tijdfilter (de rest gaat over berichten). Automatisch = Vandaag, of Alles als er vandaag nog bijna niets is. */
export function filterVideos(list: Video[], f: Filters, vorig: number, gen: string | undefined): Video[] {
  if (f.tijd === "alles") return list;
  const g = genVan(gen);
  const ts = list.map((v) => tijdstip(v.tijd, g));
  let t: Exclude<Tijd, "auto">;
  if (f.tijd === "auto") {
    const vandaag = vanafVoor("vandaag", vorig);
    t = ts.filter((x) => x != null && x >= vandaag).length >= GENOEG ? "vandaag" : "alles"; // net na middernacht: alles
  } else t = f.tijd;
  if (t === "alles") return list;
  const vanaf = t === "sinds" && !vorig ? -Infinity : vanafVoor(t, vorig);
  return list.filter((_, i) => ts[i] == null || ts[i]! >= vanaf);
}
export const aantalExtra = (f: Filters, alles: boolean) => (alles && f.cats.length ? 1 : 0) + (f.video ? 1 : 0) + (f.samen ? 1 : 0) + (f.regio.length ? 1 : 0) + (f.sort !== "nieuw" ? 1 : 0);

// ------------------------------------------------------------- knop + onderblad
export function FilterBalk({ u, f, alles, onOpen, video }: { u: Uitkomst | null; f: Filters; alles: boolean; onOpen: () => void; video?: boolean }) {
  const extra = video ? 0 : aantalExtra(f, alles);
  const tijd = u ? u.tijd : f.tijd === "auto" ? "vandaag" : f.tijd;
  return (
    <div className="fbar">
      <button type="button" className={`fpill ${extra || f.tijd !== "auto" ? "has" : ""}`} onClick={onOpen} aria-haspopup="dialog" title="Filters">
        <Icon name="clock" />
        <span className="fpill-t">{!u && f.tijd === "auto" ? "Tijd: automatisch" : TIJD_LABEL[tijd]}</span>
        {u ? <span className="fpill-n tnum">{u.items.length}</span> : null}
        {extra ? <span className="fpill-x tnum">+{extra} {extra === 1 ? "filter" : "filters"}</span> : null}
      </button>
    </div>
  );
}

// Onderwerpgroepen voor Filmpjes (#459): de AI deelt alleen NIEUWE filmpjes in, in één gebundelde call per run.
// De groep per link staat in DO-opslag (sleutel `filmgroep`, geen KV); zonder budget, bij een AI-fout of ongeldig antwoord geldt de
// deterministische kanaalregel. Een mislukte poging (leeg of ongeldig antwoord, fout, time-out) telt per filmpje en wacht met backoff
// (15 min × 2^(pogingen-1)) tot een volgende poging, zodat een cron van */5 niet elke run dezelfde filmpjes opnieuw vraagt; na GROEP_POGINGEN wordt de kanaalregel bewaard (#461). Pure logica, getest in tests/filmgroep.test.ts.
import { chat, type Usage } from "./ai";
import { FILM_GROEPEN, isFilmGroep, type FilmGroep } from "../../src/filmgroep";

export const GROEP_MAX = 40; // nieuwe filmpjes per call; de rest volgt in een volgende run
export const GROEP_TTL_MS = 3 * 24 * 3600e3;
export const GROEP_POGINGEN = 3; // mislukte pogingen (item ontbrak, onbekende groep, leeg antwoord, fout of time-out), daarna wordt de terugval bewaard
export const GROEP_BACKOFF_MS = 15 * 60e3; // wacht na poging n: GROEP_BACKOFF_MS × 2^(n-1)
export const GROEP_WACHT_MS = 25e3;

/** Vaste beschrijving en terugvalgroep per bekend kanaal; de beschrijving gaat mee in de prompt. */
export const KANALEN: Record<string, { groep: FilmGroep; info: string }> = {
  "ESPN NL": { groep: "Sport", info: "sportzender (voetbal, Eredivisie, interviews met sporters)" },
  "Ziggo Sport": { groep: "Sport", info: "sportzender" },
  "NOS Sport": { groep: "Sport", info: "sportnieuws van de NOS" },
  "FORMULA 1": { groep: "Sport", info: "Formule 1, autosport" },
  "OnsOranje": { groep: "Sport", info: "Nederlands voetbalelftal" },
  "RTL Boulevard": { groep: "Showbizz", info: "showbizz en BN'ers" },
  "Shownieuws": { groep: "Showbizz", info: "showbizz en BN'ers" },
  "PowNews": { groep: "Opvallend", info: "satire, jong publiek, opvallende filmpjes" },
  "Omroep PowNed": { groep: "Opvallend", info: "satire en opvallende filmpjes" },
  "GeenStijl": { groep: "Opvallend", info: "satirisch weblog" },
  "AutoWeek": { groep: "Opvallend", info: "auto's en techniek" },
  "Autovisie": { groep: "Opvallend", info: "auto's en techniek" },
  "NOS": { groep: "Nieuws", info: "nieuws" },
  "NOS Stories": { groep: "Nieuws", info: "nieuws en achtergrond" },
  "WNL": { groep: "Nieuws", info: "nieuws en opinie" },
  "NH Nieuws": { groep: "Nieuws", info: "regionaal nieuws Noord-Holland" },
  "RTL Nieuws": { groep: "Nieuws", info: "nieuws" },
  "RTL Z": { groep: "Nieuws", info: "economisch nieuws" },
  "NU.nl": { groep: "Nieuws", info: "nieuws" },
  "EenVandaag": { groep: "Nieuws", info: "actualiteiten en achtergrond" },
  "De Telegraaf": { groep: "Nieuws", info: "nieuws" },
  "Haarlem105": { groep: "Nieuws", info: "regionaal nieuws Haarlem" },
  "Hart van Nederland": { groep: "Nieuws", info: "nieuws" },
  "Nieuwsuur": { groep: "Nieuws", info: "nieuws en achtergrond" },
  "BNR": { groep: "Nieuws", info: "nieuws en economie" },
  "Radar": { groep: "Nieuws", info: "consumentenprogramma" },
};

export type FilmIn = { href: string; titel: string; ai?: string; bron?: string; _k?: string; _kanaal?: string };
export const kanaalVan = (v: FilmIn): string => v._k || v._kanaal || "";
/** Sleutel per filmpje: link zonder protocol, www en #-deel (de query blijft, want daar staat bij YouTube het video-id in). */
export const groepSleutel = (href: string) => href.replace(/^https?:\/\/(www\.)?/, "").replace(/#.*$/, "").replace(/\/$/, "");

/** Deterministische regel (kanaal, anders de hint, anders Nieuws); `hint` is een groep die de Worker al uit de bronnenlijst kent (Politiek-kanalen). */
export function terugvalGroep(v: FilmIn, hint?: FilmGroep): FilmGroep {
  const k = KANALEN[kanaalVan(v)];
  if (k) return k.groep;
  if (hint) return hint;
  return "Nieuws";
}

// ---------------------------------------------------------------- opslag
/** g = bewaarde groep per link met tijdstip; p = [aantal mislukte pogingen, tijdstip van de laatste] per filmpje. Oudere opslag had alleen het aantal (p: Record<string, number>); leesOpslag leest dat als tijdstip 0 (backoff verstreken). */
export type GroepOpslag = { g: Record<string, [FilmGroep, number]>; p: Record<string, [number, number]> };
export const leegOpslag = (): GroepOpslag => ({ g: {}, p: {} });

/** Alleen links uit de huidige set die jonger zijn dan 3 dagen blijven (houdt de opslag klein). */
export function snoeiGroepen(o: GroepOpslag, nu: number, huidig: Set<string>): GroepOpslag {
  const g: GroepOpslag["g"] = {}, p: GroepOpslag["p"] = {};
  for (const [k, r] of Object.entries(o.g)) if (huidig.has(k) && nu - r[1] < GROEP_TTL_MS) g[k] = r;
  for (const [k, n] of Object.entries(o.p)) if (huidig.has(k) && !g[k]) p[k] = n;
  return { g, p };
}

/** Geldig bewaard formaat? Alles wat afwijkt telt als leeg (alles komt dan opnieuw als nieuw). */
export function leesOpslag(x: unknown): GroepOpslag {
  const o = x as GroepOpslag | undefined;
  if (!o || typeof o !== "object" || !o.g || typeof o.g !== "object") return leegOpslag();
  const g: GroepOpslag["g"] = {};
  for (const [k, r] of Object.entries(o.g)) if (Array.isArray(r) && isFilmGroep(r[0]) && typeof r[1] === "number") g[k] = [r[0], r[1]];
  const p: GroepOpslag["p"] = {};
  for (const [k, n] of Object.entries((o.p || {}) as Record<string, unknown>)) {
    if (typeof n === "number") p[k] = [n, 0];
    else if (Array.isArray(n) && typeof n[0] === "number" && typeof n[1] === "number") p[k] = [n[0], n[1]];
  }
  return { g, p };
}

// ---------------------------------------------------------------- AI
const REGELS =
  "Deel elk filmpje in precies één groep in:\n" +
  "- Nieuws: binnenlands en buitenlands nieuws, incidenten, beleid zonder partijpolitiek\n" +
  "- Politiek: partijen, kabinet, Kamer, politici aan het woord\n" +
  "- Showbizz: BN'ers, celebrities, tv, muziek, entertainment\n" +
  "- Opvallend: human interest, curieus, auto/techniek-gadgets, satire/PowNews\n" +
  "- Sport: alle sport, ook interviews met sporters of clubbestuurders en ongewone sporten\n" +
  'Gebruik het kanaal en de kanaalbeschrijving als titel en tekst weinig zeggen. Antwoord alleen met JSON: {"items":[{"id":1,"groep":"Sport"}]}. Gebruik exact een van: ' + FILM_GROEPEN.join(", ") + ".";

const knip = (s: string | undefined, n: number) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

export function bouwPrompt(items: FilmIn[]): string {
  return REGELS + "\n\nFilmpjes:\n" + JSON.stringify(items.map((v, i) => ({ id: i + 1, titel: knip(v.titel, 120), tekst: knip(v.ai, 140), kanaal: kanaalVan(v) || v.bron || "", kanaalinfo: KANALEN[kanaalVan(v)]?.info || "" })));
}

/** Leest het antwoord strikt: per id één geldige groep; al het andere wordt genegeerd. */
export function leesAntwoord(txt: string, n: number): Map<number, FilmGroep> {
  const uit = new Map<number, FilmGroep>();
  let j: any;
  try { j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); } catch { return uit; }
  const arr = Array.isArray(j) ? j : j?.items;
  for (const x of Array.isArray(arr) ? arr : []) {
    const id = Number(x?.id);
    if (Number.isInteger(id) && id >= 1 && id <= n && !uit.has(id) && isFilmGroep(x?.groep)) uit.set(id, x.groep);
  }
  return uit;
}

/** Eén AI-call voor alle meegegeven filmpjes. Gooit bij een AI-fout of time-out; geeft anders de geldig ingedeelde ids (1-gebaseerd) terug. */
export async function deelIn(ai: Ai, model: string, items: FilmIn[], u: Usage): Promise<Map<number, FilmGroep>> {
  const sys = "Je deelt Nederlandse videofilmpjes in onderwerpgroepen in voor een nieuwssite. Antwoord alleen met geldige JSON, zonder uitleg of markdown.";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wacht = new Promise<never>((_, nee) => { timer = setTimeout(() => nee(new Error("time-out filmgroepen")), GROEP_WACHT_MS); });
  try { return leesAntwoord(await Promise.race([chat(ai, model, sys, bouwPrompt(items), 16 * items.length + 60, u, true), wacht]), items.length); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

export type GroepRun = { groepen: Map<string, FilmGroep>; opslag: GroepOpslag; gewijzigd: boolean; nieuw: number; aiCall: boolean; uitgesteld: number };

/** Bepaalt de groep van alle filmpjes. `mag` = er is AI-budget; `vraag` = de AI-call (alleen voor nieuwe items die niet in backoff zitten, maximaal GROEP_MAX). */
export async function groepeerFilmpjes(
  videos: FilmIn[], oud: GroepOpslag, nu: number, mag: boolean, vraag: (items: FilmIn[]) => Promise<Map<number, FilmGroep>>, hint: (v: FilmIn) => FilmGroep | undefined = () => undefined,
): Promise<GroepRun> {
  const huidig = new Set(videos.map((v) => groepSleutel(v.href)));
  const bewaard = leesOpslag(oud);
  const opslag = snoeiGroepen(bewaard, nu, huidig);
  let gewijzigd = JSON.stringify(opslag) !== JSON.stringify(bewaard);
  const nieuwe = videos.filter((v, i) => !opslag.g[groepSleutel(v.href)] && videos.findIndex((w) => groepSleutel(w.href) === groepSleutel(v.href)) === i);
  // backoff: een filmpje met mislukte pogingen komt pas weer aan de beurt als 15 min × 2^(n-1) na de laatste poging verstreken is (teruggelopen klok = aan de beurt)
  const aanDeBeurt = (k: string) => { const r = opslag.p[k]; return !r || r[1] > nu || nu - r[1] >= GROEP_BACKOFF_MS * 2 ** (r[0] - 1); };
  const klaar = nieuwe.filter((v) => aanDeBeurt(groepSleutel(v.href)));
  const stuur = mag ? klaar.slice(0, GROEP_MAX) : [];
  const uitgesteld = mag ? nieuwe.length - klaar.length : 0;
  let nieuw = 0, aiCall = false;
  const poging = (v: FilmIn) => {
    const k = groepSleutel(v.href), n = (opslag.p[k]?.[0] || 0) + 1;
    if (n >= GROEP_POGINGEN) { opslag.g[k] = [terugvalGroep(v, hint(v)), nu]; delete opslag.p[k]; nieuw++; } else opslag.p[k] = [n, nu];
    gewijzigd = true;
  };
  if (stuur.length) {
    aiCall = true;
    try {
      const res = await vraag(stuur);
      stuur.forEach((v, i) => {
        const k = groepSleutel(v.href), g = res.get(i + 1);
        if (g) { opslag.g[k] = [g, nu]; delete opslag.p[k]; nieuw++; gewijzigd = true; } else poging(v);
      });
    } catch { stuur.forEach(poging); } // AI-fout of time-out telt ook als poging
  }
  const groepen = new Map<string, FilmGroep>();
  for (const v of videos) { const k = groepSleutel(v.href); groepen.set(k, opslag.g[k]?.[0] ?? terugvalGroep(v, hint(v))); }
  return { groepen, opslag, gewijzigd, nieuw, aiCall, uitgesteld };
}

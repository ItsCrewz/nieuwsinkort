import type { Data, Item, Video } from "./types";

const obj = (v: unknown): v is Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v);
const tekst = (v: unknown) => typeof v === "string";
const teksten = (v: unknown) => Array.isArray(v) && v.every(tekst);
const opt = (v: unknown, check: (v: any) => boolean) => v === undefined || check(v);
const bron = (v: unknown) => obj(v) && tekst(v.site) && tekst(v.href);
const lijst = (v: unknown, check: (v: any) => boolean) => Array.isArray(v) && v.every(check);
const item = (v: unknown): v is Item => obj(v) && ["nl", "buitenland", "tech", "haarlem", "showbizz", "politiek", "voetbal", "f1", "auto", "sport"].includes(v.cat) &&
  [v.kop, v.ai, v.samenvatting, v.tijd].every(tekst) && teksten(v.punten) && lijst(v.bronnen, bron) &&
  opt(v.beeld, tekst) && opt(v.beelden, teksten) && opt(v.meer, tekst) && opt(v.ruw, (x) => typeof x === "boolean");
const video = (v: unknown): v is Video => obj(v) && [v.titel, v.ai, v.bron, v.href, v.thumb, v.populariteit, v.tijd].every(tekst) &&
  opt(v.embed, tekst) && opt(v.soort, (x) => x === "short" || x === "journaal") && opt(v.groep, tekst) && opt(v.ook, (x) => lijst(x, (b) => obj(b) && tekst(b.bron) && tekst(b.href)));

const getal = (v: unknown) => typeof v === "number" && Number.isFinite(v);
function velden(v: Record<string, any>, tekstvelden: string[], getalvelden: string[] = []) {
  const resultaat = { ...v };
  for (const k of tekstvelden) if (k in resultaat && !tekst(resultaat[k])) delete resultaat[k];
  for (const k of getalvelden) if (k in resultaat && !getal(resultaat[k])) delete resultaat[k];
  return resultaat;
}
function weer(v: Record<string, any>) {
  const w = velden(v, ["plaats", "bijgewerkt", "verwachting", "waarschuwing"]);
  for (const [k, teksten, getallen] of [
    ["nu", ["omschrijving"], ["temp", "gevoel", "van", "tot"]],
    ["vandaag", ["wind"], ["min", "max", "neerslagkans"]],
  ] as const) {
    if (obj(w[k])) w[k] = velden(w[k], [...teksten], [...getallen]);
    else delete w[k];
  }
  if (w.dagen !== undefined) w.dagen = Array.isArray(w.dagen)
    ? w.dagen.filter((d: unknown) => obj(d) && tekst(d.dag)).map((d: Record<string, any>) => velden(d, ["omschrijving"], ["min", "max"])) : [];
  if (w.bronnen !== undefined) w.bronnen = Array.isArray(w.bronnen) ? w.bronnen.filter(bron) : [];
  return w;
}

// Optionele velden die routes en dagselectie gebruiken: een ongeldige waarde weglaten, het bericht blijft (oude data zonder deze velden blijft geldig).
const OPTIONEEL: [string, (x: unknown) => boolean][] = [["id", (x) => tekst(x) && /^[a-z0-9]{8}$/.test(x as string)], ["t", getal], ["gisteren", (x) => typeof x === "boolean"]];
export function optioneel<T>(b: T): T {
  if (!obj(b)) return b;
  const r: Record<string, any> = b;
  if (!OPTIONEEL.some(([k, ok]) => k in r && !ok(r[k]))) return b;
  const c = { ...r };
  for (const [k, ok] of OPTIONEEL) if (k in c && !ok(c[k])) delete c[k];
  return c as T;
}

/** Normaliseert alleen de optionele velden van items, filmpjes en dumpert (niets wordt afgewezen); voor de server vóór dagselectie en linkbouw. Geeft dezelfde verwijzing terug als er niets wijzigt. */
export function normaliseerOptioneel<T>(d: T): T {
  if (!obj(d)) return d;
  let c: Record<string, any> = d;
  for (const k of ["items", "filmpjes", "dumpert"]) {
    const l = c[k];
    if (!Array.isArray(l)) continue;
    const n = l.map(optioneel);
    if (n.some((x, i) => x !== l[i])) c = { ...c, [k]: n };
  }
  return c as T;
}

/** Ongeldige berichten overslaan; een onbruikbare hoofdstructuur geeft een laadfout. */
export function valideer(v: unknown): { data: Data; afgewezen: number } {
  if (!obj(v) || !tekst(v.gegenereerd) || !Number.isFinite(Date.parse(v.gegenereerd)) || !tekst(v.datum) || !tekst(v.dag_samenvatting) || !obj(v.weer) || !Array.isArray(v.items) || !Array.isArray(v.filmpjes) || !Array.isArray(v.dumpert)) throw new Error("Ongeldige data.json");
  const items = v.items.filter(item).map(optioneel), filmpjes = v.filmpjes.filter(video).map(optioneel), dumpert = v.dumpert.filter(video).map(optioneel);
  return { data: { ...v, weer: weer(v.weer), items, filmpjes, dumpert } as Data, afgewezen: v.items.length + v.filmpjes.length + v.dumpert.length - items.length - filmpjes.length - dumpert.length };
}

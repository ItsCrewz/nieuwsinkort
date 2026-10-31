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
  opt(v.embed, tekst) && opt(v.soort, (x) => x === "short" || x === "journaal") && opt(v.ook, (x) => lijst(x, (b) => obj(b) && tekst(b.bron) && tekst(b.href)));

/** Ongeldige berichten overslaan; een onbruikbare hoofdstructuur geeft een laadfout. */
export function valideer(v: unknown): { data: Data; afgewezen: number } {
  if (!obj(v) || !tekst(v.datum) || !tekst(v.dag_samenvatting) || !obj(v.weer) || !Array.isArray(v.items) || !Array.isArray(v.filmpjes) || !Array.isArray(v.dumpert)) throw new Error("Ongeldige data.json");
  const items = v.items.filter(item), filmpjes = v.filmpjes.filter(video), dumpert = v.dumpert.filter(video);
  return { data: { ...v, items, filmpjes, dumpert } as Data, afgewezen: v.items.length + v.filmpjes.length + v.dumpert.length - items.length - filmpjes.length - dumpert.length };
}

// Stabiele sleutel op basis van de genormaliseerde ankerlink.
import { normLink } from "./linknorm";
export const normArtikelLink = normLink;
export const oudeArtikelLink = (l: string) => l.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
function hashLink(link: string): string {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(link)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return (h & 0xffffffffffn).toString(36).padStart(8, "0");
}
export const linkId = (link: string) => hashLink(normArtikelLink(link));
export const oudeLinkId = (link: string) => hashLink(oudeArtikelLink(link));
// Zonder id en zonder bronlink bestaat er geen stabiele identiteit: dan "" (nooit de hash van een lege tekst, die voor alle bronloze berichten gelijk is).
export function artikelId(item: { id?: string; bronnen?: { href: string }[] }): string { const href = item.bronnen?.[0]?.href; return item.id || (href ? linkId(href) : ""); }
export const heeftArtikelId = (item: { id?: string; bronnen?: { href: string }[] }) => !!artikelId(item);
export function artikelSlug(s: string): string { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80); }
export function artikelPad(item: { id?: string; kop: string; bronnen?: { href: string }[] }, dag: string): string { if (!heeftArtikelId(item)) return ""; return `/bericht/${dag}/${artikelId(item)}-${artikelSlug(item.kop) || "bericht"}`; }
export function parsePad(pad: string) { const m = /^\/bericht\/(\d{4}-\d{2}-\d{2})\/([a-z0-9]{8})-([a-z0-9-]+)$/.exec(pad); return m ? { dag: m[1], id: m[2], slug: m[3] } : null; }
// Zelfde regel als de artikelpagina: letterlijke feedtekst (ruw) en partijtekst (politiek) niet laten indexeren.
export const indexeerbaar = (item: { ruw?: boolean; cat?: string }) => !item.ruw && item.cat !== "politiek";

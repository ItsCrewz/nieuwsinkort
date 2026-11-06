// Stabiele sleutel op basis van de genormaliseerde ankerlink.
export const normArtikelLink = (l: string) => l.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
export function linkId(link: string): string {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(normArtikelLink(link))) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return (h & 0xffffffffffn).toString(36).padStart(8, "0");
}
// Zonder id en zonder bronlink is er geen stabiele ankeridentiteit: dan "" (nooit de hash van een lege tekst, die voor alle bronloze berichten gelijk is).
export function artikelId(item: { id?: string; bronnen?: { href: string }[] }): string { const h = item.bronnen?.[0]?.href; return item.id || (h && normArtikelLink(h) ? linkId(h) : ""); }
export function artikelSlug(s: string): string { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80); }
// Lege tekst als er geen identiteit is (geen id en geen bronlink): aanroepers publiceren dan geen link. Een expliciete id blijft altijd geldig.
export function artikelPad(item: { id?: string; kop: string; bronnen?: { href: string }[] }, dag: string): string { const id = artikelId(item); return id ? `/bericht/${dag}/${id}-${artikelSlug(item.kop) || "bericht"}` : ""; }
export function parsePad(pad: string) { const m = /^\/bericht\/(\d{4}-\d{2}-\d{2})\/([a-z0-9]{8})-([a-z0-9-]+)$/.exec(pad); return m ? { dag: m[1], id: m[2], slug: m[3] } : null; }
// Zelfde regel als de artikelpagina: letterlijke feedtekst (ruw) en partijtekst (politiek) niet laten indexeren.
export const indexeerbaar = (item: { ruw?: boolean; cat?: string }) => !item.ruw && item.cat !== "politiek";

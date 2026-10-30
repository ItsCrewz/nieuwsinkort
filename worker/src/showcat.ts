// Showbizzverhalen uit algemene feeds (nl/buitenland) naar Showbizz verplaatsen; eigen bestand naast sportcat.ts.
// Social-feeds (YouTube, Instagram, Reddit, Kittygram) tellen per feed-URL niet als nieuws.
const SHOW_PAD_PER_HOST: [RegExp, RegExp][] = [
  [/(^|\.)rtl\.nl$/, /^\/boulevard\//i],
  [/(^|\.)nu\.nl$/, /^\/(?:achterklap|entertainment|media|muziek|film)\//i],
  [/(^|\.)telegraaf\.nl$/, /^\/entertainment\//i],
  [/(^|\.)ad\.nl$/, /^\/(?:show|cultuur)\//i],
  [/(^|\.)volkskrant\.nl$/, /^\/cultuur-media\//i],
  [/(^|\.)linda\.nl$/, /./],
];
export function isShowLink(href: string): boolean {
  try {
    const u = new URL(href);
    return SHOW_PAD_PER_HOST.some(([h, p]) => h.test(u.hostname.toLowerCase()) && p.test(u.pathname));
  } catch { return false; }
}
export const SOCIAL_URL = /youtube\.com|instagram\.com|reddit\.com|kg\.meowing\.de/i;
// Social-feeds en podcasts zijn geen nieuws, behalve bij politiek.
export function nietAlsNieuws(g: string, info: string, url: string): boolean {
  return g !== "politiek" && (/Podcast/.test(info) || SOCIAL_URL.test(url));
}
// Misdaad en justitie gaan voor: zo'n bericht blijft Nederland/Buitenland, ook met showbizzpad of -bron (#110, 'Bolle Jos').
export const MISDAAD = /\b(?:politie|opsporing|om|openbaar ministerie|rechtbank|rechter|officier van justitie|aangehouden|aanhouding|arrestatie|gearresteerd|verdacht\w*|liquidatie\w*|crimineel|criminele|criminelen|misdaad\w*|moord\w*|doodgeschoten|schietpartij|drugs\w*|witwas\w*|veroordeeld|celstraf|gevangenisstraf|opgepakt)\b/i;
export function showCat({ cat, items, kop = "" }: { cat: string; items: { cat?: string; href: string }[]; kop?: string }): "showbizz" | null {
  if (cat !== "nl" && cat !== "buitenland") return null;
  if (MISDAAD.test(kop)) return null;
  const n = items.filter((i) => i.cat === "showbizz" || isShowLink(i.href)).length;
  return items.length && n * 2 >= items.length ? "showbizz" : null;
}
export function herindeelShow(k: { cat: string; c: { cat?: string; href: string; t?: string; s?: string }[] }): void {
  k.cat = showCat({ cat: k.cat, items: k.c, kop: k.c.map((c) => `${c.t || ""} ${c.s || ""}`).join(" ") }) || k.cat;
}

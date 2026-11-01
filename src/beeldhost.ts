// Allowlist van uitgeversbeeldhosts voor de eigen beeldproxy (/media/beeld/<host>/<pad>), gedeeld door
// client (beeldViaProxy) en Pages Function (functions/media/beeld/[[path]].ts): één bron, dus nooit twee lijsten.
// Alleen exacte hostnamen of strikte patronen op labelgrens; geen IP's, poorten of vrije hosts (SSRF-grens).
const EXACT = new Set([
  "redactie.rtl.nl", "prod-img.telegraaf.nl", "images.nu.nl", "images.cdn.nos.nl", "images.nrc.nl",
  "prod-img.noordhollandsdagblad.nl", "www.linda.nl", "images.ad.nl", "image.volkskrant.nl", "image.trouw.nl",
]);
const PATRONEN = [/^webp\.[a-z]{2}\.cdn\.pxr\.nl$/, /^cdn-\d{1,3}\.motorsport\.com$/];

export const beeldHostToegestaan = (host: string): boolean => EXACT.has(host) || PATRONEN.some((p) => p.test(host));

/** Proxy-pad voor een https-beeld-URL op de allowlist; anders null (dan blijft de URL ongewijzigd). */
export function beeldProxyPad(src: string): string | null {
  let u: URL;
  try { u = new URL(src); } catch { return null; }
  if (u.protocol !== "https:" || u.port || u.username || u.password || !beeldHostToegestaan(u.hostname)) return null;
  return `/media/beeld/${u.hostname}${u.pathname}${u.search}`;
}

/** Artikelbeeld via onze eigen /media/beeld-proxy (geen cookies van derden); onbekende of ongeldige URL's blijven staan. */
export const beeldViaProxy = (src: string): string => beeldProxyPad(src) ?? src;

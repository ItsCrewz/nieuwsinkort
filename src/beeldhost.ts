// Allowlist van uitgeversbeeldhosts voor de eigen beeldproxy (/media/beeld/<host>/<pad>), gedeeld door
// client (beeldViaProxy) en Pages Function (functions/media/beeld/[[path]].ts): één bron, dus nooit twee lijsten.
// Alleen exacte hostnamen of strikte patronen op labelgrens; geen IP's, poorten of vrije hosts (SSRF-grens).
const EXACT = new Set([
  "redactie.rtl.nl", "prod-img.telegraaf.nl", "images.nu.nl", "images.cdn.nos.nl", "images.nrc.nl",
  "prod-img.noordhollandsdagblad.nl", "prod-img.dvhn.nl", "www.linda.nl", "images.ad.nl", "image.volkskrant.nl", "image.trouw.nl",
]);
const PATRONEN = [/^webp\.[a-z]{2}\.cdn\.pxr\.nl$/, /^cdn-\d{1,3}\.motorsport\.com$/];

// Gewone websites (geen beeld-CDN) alleen onder hun beeldpadprefix, zodat de proxy geen open doorgeefluik naar de hele site is.
const PREFIX: Record<string, string[]> = { "www.linda.nl": ["/lindanl-assets/", "/wp-content/"] };

export const beeldHostToegestaan = (host: string): boolean => EXACT.has(host) || PATRONEN.some((p) => p.test(host));

/** Hostbeperking op het pad (alleen voor gewone websites); ook voor redirect-doelen. */
export const beeldPrefixToegestaan = (host: string, pad: string): boolean => !PREFIX[host] || PREFIX[host].some((x) => pad.startsWith(x));

const stuurTeken = (s: string): boolean => [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

/** Padcheck (SSRF-grens) voor pad (met begin-slash) en query; gedeeld zodat de client weigert wat de server weigert. */
export function beeldPadToegestaan(host: string, pad: string, search: string): boolean {
  // Percent-codes (spaties in bestandsnamen) blijven staan zoals ze zijn, maar geen versluierde slash/punt/backslash/control/%25.
  if (pad.length < 2 || pad[0] !== "/" || stuurTeken(pad) || /\\|%(?:2[5ef]|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(pad) || pad.includes("//") || pad.split("/").some((s) => s === "." || s === "..")) return false;
  if (stuurTeken(search) || search.includes("\\")) return false;
  return beeldPrefixToegestaan(host, pad);
}

/** Proxy-pad voor een https-beeld-URL op de allowlist; anders null (dan blijft de URL ongewijzigd). */
export function beeldProxyPad(src: string): string | null {
  let u: URL;
  try { u = new URL(src); } catch { return null; }
  if (u.protocol !== "https:" || u.port || u.username || u.password || !beeldHostToegestaan(u.hostname) || !beeldPadToegestaan(u.hostname, u.pathname, u.search)) return null;
  return `/media/beeld/${u.hostname}${u.pathname}${u.search}`;
}

/** Artikelbeeld via onze eigen /media/beeld-proxy (geen cookies van derden); onbekende of ongeldige URL's blijven staan. */
export const beeldViaProxy = (src: string): string => beeldProxyPad(src) ?? src;

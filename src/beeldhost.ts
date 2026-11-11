// Allowlist van uitgeversbeeldhosts voor de eigen beeldproxy (/media/beeld/<host>/<pad>), gedeeld door
// client (beeldViaProxy) en Pages Function (functions/media/beeld/[[path]].ts): één bron, dus nooit twee lijsten.
// Alleen exacte hostnamen of strikte patronen op labelgrens; geen IP's, poorten of vrije hosts (SSRF-grens).
const EXACT = new Set([
  "redactie.rtl.nl", "prod-img.telegraaf.nl", "images.nu.nl", "images.cdn.nos.nl", "images.nrc.nl",
  "prod-img.noordhollandsdagblad.nl", "prod-img.dvhn.nl", "www.linda.nl", "images.ad.nl", "image.volkskrant.nl", "image.trouw.nl", "images.pubble.cloud",
]);
const PATRONEN = [/^webp\.[a-z]{2}\.cdn\.pxr\.nl$/, /^cdn-\d{1,3}\.motorsport\.com$/];

// Beperk websites en gedeelde CDN's tot hun beeldpad, zodat de proxy geen open doorgeefluik is.
const PREFIX: Record<string, string[]> = { "www.linda.nl": ["/lindanl-assets/", "/wp-content/"] };
const PADPATROON: Record<string, RegExp> = { "images.pubble.cloud": /^\/worker\/(jpg|webp|png)\/[a-z]+\/\d+\/\d+\/648e3015\/content\/[0-9]{4}\/[0-9]{2}\/[A-Za-z0-9-]+$/ };

export const beeldHostToegestaan = (host: string): boolean => EXACT.has(host) || PATRONEN.some((p) => p.test(host));

/** Hostbeperking op het pad; ook voor redirect-doelen. */
export const beeldPrefixToegestaan = (host: string, pad: string, search = ""): boolean =>
  (!PREFIX[host] || PREFIX[host].some((x) => pad.startsWith(x))) && (!PADPATROON[host] || (!search && PADPATROON[host].test(pad)));

const stuurTeken = (s: string): boolean => [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

/** Padcheck (SSRF-grens) voor pad (met begin-slash) en query; gedeeld zodat de client weigert wat de server weigert. */
export function beeldPadToegestaan(host: string, pad: string, search: string): boolean {
  // Percent-codes (spaties in bestandsnamen) blijven staan zoals ze zijn, maar geen versluierde slash/punt/backslash/control/%25.
  if (pad.length < 2 || pad[0] !== "/" || stuurTeken(pad) || /\\|%(?:2[5ef]|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(pad) || pad.includes("//") || pad.split("/").some((s) => s === "." || s === "..")) return false;
  if (stuurTeken(search) || search.includes("\\")) return false;
  return beeldPrefixToegestaan(host, pad, search);
}

/** Proxy-pad voor een https-beeld-URL op de allowlist; anders null (dan blijft de URL ongewijzigd). */
export function beeldProxyPad(src: string): string | null {
  let u: URL;
  try { u = new URL(src); } catch { return null; }
  if (u.protocol !== "https:" || u.port || u.username || u.password || !beeldHostToegestaan(u.hostname) || !beeldPadToegestaan(u.hostname, u.pathname, u.search)) return null;
  return `/media/beeld/${u.hostname}${kleinerPad(u)}${kleinerQuery(u)}`;
}

// Vangrail (#563): kaarten zijn hooguit ~600 css-px breed, dus een 1920 px-bron is verspilde transfer.
const MAX_BREEDTE = 840;
/** Pubble: breedte in het pad (`/worker/jpg/quick/1920/<id>/…`) terug naar MAX_BREEDTE; kleinere blijft staan. */
function kleinerPad(u: URL): string {
  if (u.hostname !== "images.pubble.cloud") return u.pathname;
  return u.pathname.replace(/^(\/worker\/[a-z]+\/[a-z]+\/)(\d+)(?=\/)/, (m, v, b) => (+b > MAX_BREEDTE ? v + MAX_BREEDTE : m));
}
/** Hosts met een breedte-parameter in de query: boven 1200 terug naar 1200 (bestaande waarden eronder blijven). */
function kleinerQuery(u: URL): string {
  return u.search.replace(/([?&](?:width|w)=)(\d+)(?=&|$)/, (m, v, b) => (+b > 1200 ? v + 1200 : m));
}

/** Artikelbeeld via onze eigen /media/beeld-proxy (geen cookies van derden); onbekende of ongeldige URL's blijven staan. */
export const beeldViaProxy = (src: string): string => beeldProxyPad(src) ?? src;

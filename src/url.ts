// Defense in depth: alleen volledige, parseerbare http(s)-URL's met host (React 18 laat javascript: door).
// Geeft de opgeschoonde (getrimde, genormaliseerde) URL terug; anders undefined zodat er geen klikbare bestemming is.
export const veiligeUrl = (u?: string): string | undefined => {
  if (!u) return undefined;
  const s = u.trim(); // bewust buiten de try: een niet-string blijft een TypeError geven (zie schoon-randgevallen)
  // WHATWG-parser slikt `https:///pad` als host "pad"; eis dus een host direct na `//`.
  if (!/^https?:\/\/[^/\\?#]/i.test(s)) return undefined;
  try {
    const url = new URL(s);
    return url.hostname ? url.href : undefined;
  } catch {
    return undefined;
  }
};

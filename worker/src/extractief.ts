// Deterministische samenvatting zonder AI (pure functies): opschonen van feedtekst, zinnen splitsen en inkorten.
// Gebruikt door de uur-Worker als de AI op is of een aanroep mislukt, zodat de site nooit leeg raakt (ruw: true).

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", euml: "ë", eacute: "é", egrave: "è", iuml: "ï", ouml: "ö", uuml: "ü" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return " "; } }
  return ENT[e.toLowerCase()] ?? m;
});

// Voorvoegsels als "Podcast |", "LIVE:" of "VIDEO -" horen niet in een samenvatting.
const PREFIX = /^\s*(?:(?:podcast|live(?:blog)?|video|foto'?s?|update|watch|luister|kijk|breaking|uitgelicht)(?:\s*[|:]|\s+[-–—])\s*|(?:LIVE|VIDEO|FOTO'?S?)\s+(?=[A-Z0-9"'‘“]))+/i;

/** HTML, entiteiten, dubbele spaties en kopprefixes weg. */
export function schoon(s: string): string {
  const t = decode(decode(String(s || "").replace(/<[^>]*>/g, " "))).replace(/\s+/g, " ").trim();
  return t.replace(PREFIX, "").trim();
}

// Een punt na deze woorden eindigt de zin niet.
const AFKORT = new Set(["o.a", "bijv", "enz", "etc", "d.w.z", "m.b.t", "t.o.v", "i.v.m", "e.d", "b.v", "dhr", "mevr", "mw", "mr", "dr", "drs", "ir", "prof", "ing", "nr", "ca", "vs", "st", "blz", "max", "min", "tel", "jr", "sr", "bv", "nv", "fam", "gem", "inl", "evt", "resp", "m.u.v", "z.o.z", "no", "mrs", "mr", "ms", "inc", "ltd", "vgl", "zgn", "a.s", "j.l"]);

/** Splitst op zingrenzen, maar niet na afkortingen ("o.a.", "dhr.") of voorletters ("J. Jansen"). */
export function zinnen(s: string): string[] {
  const t = s.trim();
  const uit: string[] = [];
  let start = 0;
  const re = /[.!?]+["'”’)\]]*(\s+)/g;
  for (let m: RegExpExecArray | null; (m = re.exec(t)); ) {
    const voor = t.slice(start, m.index + m[0].length - m[1].length);
    const volgende = t[m.index + m[0].length] || "";
    if (m[0].startsWith(".")) {
      const woord = (voor.match(/(\S+?)\.+["'”’)\]]*$/)?.[1] || "").replace(/^[("'“‘]+/, "").toLowerCase();
      if (AFKORT.has(woord) || /^[a-z]$/.test(woord)) continue; // afkorting of voorletter
      if (/[a-zà-ÿ]/.test(volgende)) continue; // kleine letter erna: geen zinseinde
    }
    uit.push(voor.trim());
    start = m.index + m[0].length;
  }
  const rest = t.slice(start).trim();
  if (rest) uit.push(rest);
  return uit.filter(Boolean);
}

const woorden = (s: string) => s.split(/\s+/).filter(Boolean);

/** Knipt op woordgrens en zet een weglatingsteken als er iets af is. */
export function knip(s: string, maxTekens: number): string {
  if (s.length <= maxTekens) return s;
  return s.slice(0, maxTekens - 1).replace(/\s+\S*$/, "").replace(/[\s.,:;!?-]+$/, "") + "…";
}

function maxWoorden(s: string, n: number): string {
  const w = woorden(s);
  return w.length <= n ? s : w.slice(0, n).join(" ").replace(/[\s.,:;!?-]+$/, "") + "…";
}

/** De eerste 2–3 hele zinnen, samen hooguit `n` woorden; is de eerste zin al te lang dan wordt die ingekort. */
export function eersteZinnen(s: string, n = 50, max = 3): string {
  const z = zinnen(s);
  if (!z.length) return "";
  const uit: string[] = [];
  let w = 0;
  for (const x of z.slice(0, max)) {
    const nw = woorden(x).length;
    if (uit.length && w + nw > n) break;
    uit.push(x);
    w += nw;
  }
  return maxWoorden(uit.join(" "), n);
}

export type Extractief = { kop: string; ai: string; samenvatting: string };

/**
 * Extractieve samenvatting van één feedbericht (titel `t`, omschrijving `s`).
 * Nederlands: ingekorte kop, eerste zin als ai, 2–3 zinnen (±50 woorden) als samenvatting.
 * Engels (nl=false): kop + eerste zin, met label "(Engels)". Null als er niets bruikbaars is.
 */
export function extractief(c: { t?: string; s?: string }, nl: boolean): Extractief | null {
  let t = schoon(c.t || "").replace(/\s*(…|\.\.\.)$/, "");
  let d = schoon(c.s || "");
  if (t && d.toLowerCase().startsWith(t.toLowerCase())) d = d.slice(t.length).replace(/^[\s.!?,:;…-]+/, "");
  if (!t) { // partijposts e.d.: geen titel, dan de eerste zin van de tekst
    t = zinnen(d)[0] || d;
    d = d.slice(t.length).trim();
  }
  if (!t) return null;
  const kop = knip(t, 120);
  if (!nl) {
    const zin = maxWoorden(zinnen(d)[0] || "", 35);
    const ai = `(Engels) ${zin || "Engelstalig bericht, lees het via de bron."}`;
    return { kop, ai, samenvatting: ai };
  }
  const samenvatting = eersteZinnen(d, 50, 3);
  const ai = knip(zinnen(samenvatting)[0] || samenvatting, 240);
  return { kop, ai: ai || kop, samenvatting: samenvatting || kop };
}

// Artikeltekst uit een nieuwspagina halen (zonder AI, zonder DOM): JSON-LD articleBody, anders de <p>'s
// uit <article>/<main>. Alleen alinea's met echte zinnen; cookie-, abonnee- en deelteksten eruit.
import { decode } from "./parse";

const RUIS = /notificatie|meldingen ontvangen|cookie|abonne|abonnement|log ?in|inloggen|registreer|nieuwsbrief|newsletter|subscribe|sign up|advertent|lees ook|lees meer|meer over dit onderwerp|deel dit|share this|privacy|javascript|copyright|©|alle rechten|download de app|volg ons|follow us|klik hier|click here|related|gerelateerd|tip de redactie|whatsapp|reageer|comments?\b|this article|dit artikel is|premium|plus-artikel|al abonnee|probeer gratis|advertisement|sponsored|gesponsord|affiliate|getty images|anp\s*$|foto:|beeld:/i;

const clean = (s: string) => decode(s.replace(/<(script|style|figure|figcaption|aside|nav|button|form|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function zinnig(p: string) {
  if (p.length < 60 || p.length > 2500) return false;
  if (/(\.\.\.|…)$/.test(p)) return false; // teaser van een ander artikel
  if (/^\p{Extended_Pictographic}/u.test(p)) return false; // "📧 Tip de redactie" e.d.
  if (/web application firewall|request was blocked|access denied|enable javascript/i.test(p)) return false;
  if (RUIS.test(p) && p.length < 260) return false;
  if (!/[.!?:"”’)]$/.test(p) && p.length < 160) return false; // geen zin (menu, kopje, bijschrift)
  const woorden = p.split(" ").length;
  return woorden >= 10 && (p.match(/[a-zà-ÿ]/gi)?.length || 0) / p.length > 0.6;
}

function ldBody(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j: any;
    try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [j];
    while (stack.length) {
      const x = stack.pop();
      if (!x || typeof x !== "object") continue;
      if (Array.isArray(x)) { stack.push(...x); continue; }
      if (typeof x.articleBody === "string" && x.articleBody.length > 200) {
        const t = decode(x.articleBody.replace(/<[^>]+>/g, "\n"));
        out.push(...t.split(/\n\s*\n|\r?\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(zinnig));
      }
      if (x["@graph"]) stack.push(x["@graph"]);
    }
    if (out.length) break;
  }
  return out;
}

/** Alinea's van het artikel (max ~maxLen tekens, hele alinea's). Leeg = niets bruikbaars. */
export function artikelTekst(html: string, maxLen = 2400): string[] {
  let ps = ldBody(html);
  if (ps.join(" ").length < 300) {
    // Zonder JSON-LD: de langste aaneengesloten reeks zinnige <p>'s (gat tussen twee alinea's < 4000 tekens HTML).
    // Zo vallen zijbalken, teasers en "lees ook"-blokken buiten de tekst.
    const body = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, (m) => " ".repeat(Math.min(m.length, 50)));
    let best: string[] = [], bestN = 0, cur: string[] = [], curN = 0, end = -1;
    for (const m of body.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)) {
      const p = clean(m[0]);
      if (!zinnig(p)) continue;
      if (end >= 0 && m.index! - end > 4000) { cur = []; curN = 0; }
      cur.push(p); curN += p.length; end = m.index! + m[0].length;
      if (curN > bestN) { best = [...cur]; bestN = curN; }
    }
    if (bestN > ps.join(" ").length) ps = best;
  }
  const out: string[] = [], seen = new Set<string>();
  let n = 0;
  for (const p of ps) {
    const k = p.slice(0, 80).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (n + p.length > maxLen && out.length) break;
    out.push(p.length > maxLen ? p.slice(0, maxLen).replace(/\s+\S*$/, "") + "…" : p);
    n += p.length;
  }
  return out;
}

// Reddit-Atom naar afspeelbare video's, zonder extra verzoeken.
import { decode } from "./parse";
import type { Video } from "./videos";

function beeld(url: string, alleenPreview = false): string {
  try {
    const u = new URL(decode(url));
    return u.protocol === "https:" && (!alleenPreview || /^(?:external-)?preview\.redd\.it$/i.test(u.hostname)) ? u.href : "";
  } catch { return ""; }
}

function video(url: string): { embed: string; thumb: string; short?: boolean } | undefined {
  try {
    const u = new URL(decode(url));
    if (u.protocol !== "https:" && u.protocol !== "http:") return;
    const host = u.hostname.toLowerCase().replace(/^(?:www|m)\./, "");
    const vr = host === "v.redd.it" && /^\/([a-z0-9]+)(?:\/|$)/i.exec(u.pathname);
    if (vr) return { embed: `https://v.redd.it/${vr[1]}/HLSPlaylist.m3u8`, thumb: "" };
    const short = host === "youtube.com" ? /^\/shorts\/([\w-]{11})(?:\/|$)/.exec(u.pathname) : null;
    const id = short?.[1] || (host === "youtu.be" ? /^\/([\w-]{11})(?:\/|$)/.exec(u.pathname)?.[1] : host === "youtube.com" && u.pathname === "/watch" ? u.searchParams.get("v") : "");
    if (id && /^[\w-]{11}$/.test(id)) return { embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, short: !!short };
  } catch { /* Ongeldige feedlinks overslaan. */ }
}

export function parseRedditVideos(xml: string, sub: string, since: number, hhmm: (t: number) => string): Video[] {
  const out: Video[] = [];
  (xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/g) || []).forEach((e, rank) => {
    const pub = Date.parse(/<published>(.*?)<\/published>/.exec(e)?.[1] || "");
    if (!(pub >= since)) return;
    const c = decode((/<content[^>]*>([\s\S]*?)<\/content>/.exec(e)?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
    const links = [...c.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => video(m[1]));
    const v = links.find((x) => x);
    if (!v) return;
    const media = /<media:thumbnail\b[^>]*\burl\s*=\s*["']([^"']+)["']/i.exec(e)?.[1] || "";
    const previews = [...c.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => beeld(m[1], true));
    out.push({
      titel: decode(/<title>(.*?)<\/title>/.exec(e)?.[1] || "").trim(), ai: "", bron: "Reddit", href: decode(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(e)?.[1] || ""),
      embed: v.embed, thumb: v.thumb || beeld(media) || previews.find(Boolean) || "", populariteit: `#${rank + 1} top vandaag r/${sub}`,
      tijd: hhmm(pub), _score: Math.max(0, 50 - rank), _pub: pub, ...(v.short ? { soort: "short" as const } : {}),
    });
  });
  return out;
}

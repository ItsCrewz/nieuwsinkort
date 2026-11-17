// Vaste id per filmpje (voor #/filmpjes/<id>, en de KV-cache van video-samenvattingen). Zonder React, ook bruikbaar in Functions.
import type { Video } from "./types";
export function videoUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function videoHost(host: string, domein: string): boolean {
  return host === domein || host.endsWith(`.${domein}`);
}

export function youtubeId(url: string): string | null {
  const u = videoUrl(url);
  if (!u) return null;
  let id: string | null = null;
  if (videoHost(u.hostname, "youtu.be")) id = /^\/([\w-]+)/.exec(u.pathname)?.[1] || null;
  else if (videoHost(u.hostname, "youtube.com") || videoHost(u.hostname, "youtube-nocookie.com")) {
    id = u.pathname === "/watch" ? u.searchParams.get("v") : /^\/(?:embed|shorts|live)\/([\w-]+)/.exec(u.pathname)?.[1] || null;
  }
  return id && /^[\w-]{6,}$/.test(id) ? id : null;
}

export function videoSlug(v: Video): string {
  const yt = youtubeId(v.embed || "") || youtubeId(v.href);
  if (yt) return `yt-${yt}`;
  const u = videoUrl(v.href);
  if (u) {
    let m = videoHost(u.hostname, "dumpert.nl") && /^\/item\/([\w-]+)/.exec(u.pathname);
    if (m) return `d-${m[1]}`;
    m = (videoHost(u.hostname, "x.com") || videoHost(u.hostname, "twitter.com")) && /^\/[^/]+\/status\/(\d+)/.exec(u.pathname);
    if (m) return `x-${m[1]}`;
    m = videoHost(u.hostname, "reddit.com") && /^\/r\/[\w-]+\/comments\/(\w+)/.exec(u.pathname);
    if (m) return `r-${m[1]}`;
    m = videoHost(u.hostname, "instagram.com") && /^\/(?:reel|p)\/([\w-]+)/.exec(u.pathname);
    if (m) return `ig-${m[1]}`;
  }
  // Titel is geen identiteit: alleen de href (stabiel bij titelwijziging) bepaalt de sleutel.
  return `v-${hrefHash(v.href)}`;
}

function titelSlug(titel: string): string {
  return (
    titel
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "video"
  );
}

// cyrb53 over href zonder fragment, 53 bit, base36: 32 bit botste al bij een paar duizend links.
function hrefHash(href: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const t = href.split("#")[0];
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Oude sleutel (alleen titel) voor oude hashroutes; alleen veilig als precies één video in de lijst hem draagt.
export function oudeSlug(v: Video): string {
  return /^v-/.test(videoSlug(v)) ? titelSlug(v.titel) : videoSlug(v);
}
export function vindSlug(lijst: Video[], slug: string): Video | null {
  const exact = lijst.find((v) => videoSlug(v) === slug);
  if (exact) return exact;
  const oud = lijst.filter((v) => oudeSlug(v) === slug);
  return oud.length === 1 ? oud[0] : null;
}

// KV-sleutel voor video-samenvattingen: v-<hash> krijgt een eigen versie-prefix, zodat een oude titel-slug nooit op een hash-sleutel kan vallen.
export function svSleutel(id: string): string {
  return /^v-/.test(id) ? `vs2:${id}` : `vs:${id}`;
}

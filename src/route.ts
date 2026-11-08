import { CATS } from "./tabs";
import type { View } from "./types";

export type Route = { view: View; selected: string | null; video: string | null };

export function parseHash(hash: string): Route {
  let h: string;
  try { h = decodeURIComponent(hash.replace(/^#\/?/, "")); }
  catch { return { view: "alles", selected: null, video: null }; }
  if (h.startsWith("bericht/")) return { view: "alles", selected: h.slice(8), video: null };
  const c = CATS.find((c) => c.slug === h);
  if (c) return { view: c.id, selected: null, video: null };
  const m = /^(filmpjes|dumpert)(?:\/(.+))?$/.exec(h);
  if (m) return { view: m[1] as View, selected: null, video: m[2] || null };
  return { view: "alles", selected: null, video: null };
}

export function viewHash(v: View) {
  if (v === "alles") return "#/";
  const c = CATS.find((c) => c.id === v);
  return `#/${c ? c.slug : v}`;
}

// Zelfde tekst als <title> in index.html (SEO, #598)
export const HOME_TITEL = "Nieuwsinkort - Het nieuws van vandaag samengevat";

export function viewTitel(view: View): string {
  if (view === "alles") return HOME_TITEL;
  const label = CATS.find((cat) => cat.id === view)?.label ?? (view === "filmpjes" ? "Filmpjes" : "Dumpert");
  return `${label} · Nieuws in het kort`;
}

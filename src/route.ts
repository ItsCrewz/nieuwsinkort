import { CATS } from "./tabs";
import type { View } from "./types";

export type Route = { view: View; selected: string | null; video: string | null };

export function parseHash(hash: string): Route {
  const h = decodeURIComponent(hash.replace(/^#\/?/, ""));
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

export function viewTitel(view: View): string {
  if (view === "alles") return "Nieuws in het kort";
  const label = CATS.find((cat) => cat.id === view)?.label ?? (view === "filmpjes" ? "Filmpjes" : "Dumpert");
  return `${label} · Nieuws in het kort`;
}

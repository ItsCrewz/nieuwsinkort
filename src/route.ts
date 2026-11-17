import { CATS } from "./tabs";
import type { View } from "./types";

export type Route = { view: View; selected: string | null; video: string | null };

export function parseHash(hash: string): Route {
  const delen = hash.replace(/^#\/?/, "").split(/\/(.*)/s);
  let pad: string;
  let parameter: string | undefined;
  try {
    pad = decodeURIComponent(delen[0]);
    parameter = delen[1] === undefined ? undefined : decodeURIComponent(delen[1]);
  } catch { return { view: "alles", selected: null, video: null }; }
  if (pad === "bericht" && parameter !== undefined) return { view: "alles", selected: parameter, video: null };
  const c = parameter === undefined && CATS.find((c) => c.slug === pad);
  if (c) return { view: c.id, selected: null, video: null };
  if ((pad === "filmpjes" || pad === "dumpert") && parameter !== "") {
    return { view: pad, selected: null, video: parameter ?? null };
  }
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

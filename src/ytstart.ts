type YtStart = { actief: boolean; gepauzeerd: boolean; klaar: boolean; status: number | null; pogingen: number; sinds: number; nu: number; gespeeld?: boolean; fout?: boolean };

export function ytEmbedUrl(id: string, actief: boolean, origin: string): string {
  const params = new URLSearchParams({ autoplay: actief ? "1" : "0", cc_load_policy: "0", mute: "1", playsinline: "1", enablejsapi: "1", controls: "1", rel: "0", modestbranding: "1", iv_load_policy: "3", loop: "1", playlist: id, origin });
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

// Alleen een onReady van een eigen YouTube-frame krijgt de opdracht.
export function ytOndertitelsBijBericht(e: MessageEvent, frames: Iterable<HTMLIFrameElement>): void {
  if (e.origin !== "https://www.youtube-nocookie.com") return;
  let bericht: { event?: string };
  try { bericht = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
  if (bericht?.event !== "onReady") return;
  for (const frame of frames) {
    if (frame.contentWindow === e.source && frame.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({ event: "command", func: "unloadModule", args: ["captions"] }), "https://www.youtube-nocookie.com");
    }
  }
}

export function ytToonHint(s: YtStart): boolean {
  return s.actief && !s.fout && !s.gespeeld && s.status !== 1 && s.status !== 3 && s.nu - s.sinds >= 1500;
}

// Is dit een onReady van precies dit frame? Andere frames en andere origins tellen niet.
export function ytIsGereed(e: { origin: string; source: unknown; data: unknown }, frame: { contentWindow: unknown } | null | undefined): boolean {
  if (e.origin !== "https://www.youtube-nocookie.com" || !frame?.contentWindow || e.source !== frame.contentWindow) return false;
  try { const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; return (d as { event?: string } | null)?.event === "onReady"; } catch { return false; }
}

// De activatieklok loopt door bij pauze en statuswissels, ook zonder onReady.
export function ytStartBesluit(s: YtStart): "wacht" | "probeer" | "vangnet" {
  if (!s.actief || s.fout || s.status === 1 || s.status === 3 || s.gespeeld) return "wacht";
  if (ytToonHint(s)) return "vangnet";
  if (s.klaar && !s.gepauzeerd && s.pogingen < 3 && s.nu - s.sinds >= s.pogingen * 500) return "probeer";
  return "wacht";
}

export function ytEchteFout(code: unknown): boolean { return typeof code === "number" && [100, 101, 150, 152].includes(code); }
export function geluidMag(wens: boolean, tik: boolean, geblokkeerd: boolean): boolean { return wens && tik && !geblokkeerd; }
// Geluid per bron: een YouTube-blokkade geldt alleen voor YouTube, een native blokkade alleen voor poolvideo's.
export function geluidVoorSlide(kind: string, wens: boolean, tik: boolean, nativeBlocked: boolean, ytBlocked: boolean): boolean {
  return geluidMag(wens, tik, kind === "youtube" ? ytBlocked : nativeBlocked);
}
// Alleen een echte weigering telt; de 1,5 s-timeout en onError tonen hooguit de hint (ytToonHint).
export function autoplayGeblokkeerd(soort: string, _code?: unknown): boolean {
  return soort === "onAutoplayBlocked" || soort === "NotAllowedError";
}

export function ytStatusNaam(status: number | null): string {
  switch (status) {
    case -1: return "unstarted";
    case 0: return "ended";
    case 1: return "playing";
    case 2: return "paused";
    case 3: return "buffering";
    case 5: return "cued";
    default: return "onbekend";
  }
}

// Bij teruggaan blijft de eerste geblokkeerde video als vangnet staan.
export function ytVerwijderBesluit(code: unknown, i: number, actief: number, aantal: number, richting: -1 | 1): { verwijder: boolean; actief: number } {
  if (!ytEchteFout(code) || i < 0 || i >= aantal || aantal <= 1 || (i === actief && richting === -1 && i === 0)) return { verwijder: false, actief };
  if (i < actief) return { verwijder: true, actief: actief - 1 };
  if (i > actief) return { verwijder: true, actief };
  return { verwijder: true, actief: richting === -1 ? i - 1 : Math.min(i, aantal - 2) };
}

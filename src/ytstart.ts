export type YtStart = { actief: boolean; gepauzeerd: boolean; klaar: boolean; status: number | null; pogingen: number; sinds: number; nu: number; gespeeld?: boolean; fout?: boolean };

export function ytEmbedUrl(id: string, actief: boolean, origin: string): string {
  const params = new URLSearchParams({ autoplay: actief ? "1" : "0", mute: "1", playsinline: "1", enablejsapi: "1", controls: "1", rel: "0", modestbranding: "1", iv_load_policy: "3", loop: "1", playlist: id, origin });
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

export function ytToonHint(s: YtStart): boolean {
  return s.actief && !s.fout && !s.gespeeld && s.status !== 1 && s.status !== 3 && s.nu - s.sinds >= 1500;
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
export function autoplayGeblokkeerd(soort: string, code?: unknown): boolean {
  return soort === "onAutoplayBlocked" || (soort === "onError" && !ytEchteFout(code)) || soort === "NotAllowedError" || soort === "timeout";
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

// Een actieve slide wordt maar één keer per activatie overgeslagen.
export function ytSkipBesluit(code: unknown, actief: boolean, alOvergeslagen: boolean, volgende: boolean): boolean {
  return actief && ytEchteFout(code) && !alOvergeslagen && volgende;
}

export type YtStart = { actief: boolean; gepauzeerd: boolean; klaar: boolean; status: number | null; pogingen: number; sinds: number; nu: number };

export function ytStartBesluit(s: YtStart): "wacht" | "probeer" | "vangnet" {
  if (!s.actief || s.gepauzeerd) return "wacht";
  if (!s.klaar) return s.nu - s.sinds >= 2500 ? "vangnet" : "wacht";
  if (s.status !== null && s.status !== -1 && s.status !== 5) return "wacht";
  if (s.nu - s.sinds < 1000) return "wacht";
  return s.pogingen < 3 ? "probeer" : "vangnet";
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
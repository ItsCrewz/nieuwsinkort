// Hoeveel mag de videofeed vooruit bufferen? Pure logica (test: tests/buffer.test.ts), zonder React.
// afstand = positie van een slide t.o.v. de actieve (-1 = vorige, 1 = volgende, 2 = +2 ...).
// Doel: de volgende video staat klaar zonder laadpauze, zonder onbegrensd data te vreten (mobiel, Save-Data).

export type Niveau = "ruim" | "zuinig" | "minimaal";
export type Netwerk = { saveData?: boolean; effectiveType?: string } | null | undefined;

/** Netwerkniveau: Save-Data of 2g/slow-2g = minimaal (alleen playlist/metadata), 3g = zuinig, anders ruim. */
export function niveauVan(c: Netwerk): Niveau {
  if (!c) return "ruim";
  if (c.saveData) return "minimaal";
  const t = c.effectiveType || "";
  if (t === "slow-2g" || t === "2g") return "minimaal";
  if (t === "3g") return "zuinig";
  return "ruim";
}

export function leesNiveau(): Niveau {
  try {
    return niveauVan((navigator as unknown as { connection?: Netwerk }).connection);
  } catch {
    return "ruim";
  }
}

export type Plan = {
  mount: boolean; // heeft een <video>/<iframe>
  laden: boolean; // mag media-data ophalen (anders hooguit playlist/metadata)
  secs: number; // hls.js: maximaal zoveel seconden vooruit
  bytes: number; // hls.js: bovengrens in bytes voor de buffer
  mp4: "auto" | "metadata" | "none"; // preload-attribuut voor mp4/native HLS
};

const MB = 1e6;
// Actief: ruim 30 s (tot 60 s) zoals voorheen. Volgende: begrensd. Vorige: blijft staan en vult hooguit de eerste
// paar seconden bij (na terug-swipen staat de video op 0:00). hls.js neemt de seconden als bindende grens
// (maxMaxBufferLength); de bytes dekken alleen hoge bitrates af.
const VOLGENDE: Record<Niveau, { secs: number; bytes: number }> = {
  ruim: { secs: 12, bytes: 4 * MB },
  zuinig: { secs: 6, bytes: 2 * MB },
  minimaal: { secs: 0, bytes: 0 },
};
const VORIGE: Record<Niveau, { secs: number; bytes: number }> = {
  ruim: { secs: 6, bytes: 2 * MB },
  zuinig: { secs: 4, bytes: 1 * MB },
  minimaal: { secs: 0, bytes: 0 },
};

/** `apple`: iOS/Safari heeft weinig gelijktijdige decoders, daar houden we de vorige video niet gemount. */
export function planVoor(afstand: number, niveau: Niveau, apple = false): Plan {
  if (afstand === 0) return { mount: true, laden: true, secs: 30, bytes: 60 * MB, mp4: "auto" };
  if (afstand === 1) {
    const v = VOLGENDE[niveau];
    return { mount: true, laden: v.secs > 0, secs: v.secs, bytes: v.bytes, mp4: v.secs > 0 && niveau === "ruim" ? "auto" : "metadata" };
  }
  if (afstand === -1 && !apple) {
    const v = VORIGE[niveau];
    return { mount: true, laden: v.secs > 0, secs: v.secs, bytes: v.bytes, mp4: "metadata" };
  }
  return { mount: false, laden: false, secs: 0, bytes: 0, mp4: "none" };
}

/** Welke slides hebben een speler. */
export function mountSet(active: number, total: number, niveau: Niveau, apple = false): Set<number> {
  const s = new Set<number>();
  for (let i = active - 1; i <= active + 1; i++) if (i >= 0 && i < total && planVoor(i - active, niveau, apple).mount) s.add(i);
  return s;
}

/** Cache opwarmen via HTTP (playlist + n segmenten) voor slides vóórbij de gemounte: +2 en +3. Niets vanaf +4. */
export function warmPlan(afstand: number, niveau: Niveau): { playlist: boolean; segmenten: number } {
  if (afstand === 1) return { playlist: niveau === "minimaal", segmenten: 0 }; // anders laadt de speler zelf
  if (afstand === 2) return { playlist: true, segmenten: niveau === "ruim" ? 2 : 0 };
  if (afstand === 3) return { playlist: niveau !== "minimaal", segmenten: 0 };
  return { playlist: false, segmenten: 0 };
}

/** Posters (kleine plaatjes) mogen verder vooruit dan video. */
export const posterEager = (afstand: number) => afstand >= -1 && afstand <= 3;

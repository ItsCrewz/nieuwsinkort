// Framegezondheid (#50): loopt de mediaklok terwijl er geen nieuw beeld komt? Puur, tijden in ms (klok in s).
// Een lopende klok, readyState 4 of `playing` bewijzen op iOS geen zichtbaar beeld; daarom tellen we beelden.
export type FrameTik = {
  now: number; currentTime: number; paused: boolean; hidden: boolean; seeking: boolean; ended: boolean;
  /** Kort na een (gebruikers- of herstel)seek: geen oordeel. */
  seekRecent: boolean;
  /** Teller van gepresenteerde (rVFC) of gedecodeerde beelden sinds de bron; null = geen teller beschikbaar. */
  frames: number | null;
  videoWidth: number;
  readyState: number;
};
export type FrameBesluit = "ok" | "frame-vast" | "geen-eerste-frame";

/** Zonder nieuw beeld ten minste zo lang (wandklok) én zoveel klokvoortgang: beeld staat vast. */
export const VAST_MS = 2500;
export const VAST_KLOK = 1;
/** Geen eerste beeld (of breedte 0) zo lang na de start terwijl er data is of de klok loopt. */
export const EERSTE_FRAME_MS = 5000;

export class FrameGezondheid {
  private vorigeT: number | null = null;
  private vorigeNu = 0;
  private vorigeFrames: number | null = null;
  private frameOp = 0;
  private klokSindsFrame = 0;
  private startOp = 0;
  private klokSindsStart = 0;
  private gemeld = false;

  private reset(t: FrameTik) {
    this.vorigeT = t.currentTime;
    this.vorigeNu = t.now;
    this.vorigeFrames = t.frames;
    this.frameOp = t.now;
    this.klokSindsFrame = 0;
    this.startOp = t.now;
    this.klokSindsStart = 0;
  }

  tik(t: FrameTik): FrameBesluit {
    if (t.paused || t.hidden || t.seeking || t.ended || t.seekRecent || this.vorigeT === null) {
      this.reset(t);
      return "ok";
    }
    // Alleen gewone voorwaartse voortgang telt; loops en sprongen niet (die resetten alleen het ijkpunt).
    const d = t.currentTime - this.vorigeT;
    const maxD = ((t.now - this.vorigeNu) / 1000) * 2 + 0.25;
    if (d > 0 && d <= maxD) {
      this.klokSindsFrame += d;
      this.klokSindsStart += d;
    }
    this.vorigeT = t.currentTime;
    this.vorigeNu = t.now;
    if (t.frames !== null && t.frames !== this.vorigeFrames) {
      this.vorigeFrames = t.frames;
      this.frameOp = t.now;
      this.klokSindsFrame = 0;
    }
    if (this.gemeld) return "ok";
    const eersteFrame = t.videoWidth > 0 && (t.frames === null ? t.readyState >= 2 : t.frames > 0);
    if (!eersteFrame) {
      const dataOfKlok = t.readyState >= 3 || this.klokSindsStart >= 0.5;
      if (dataOfKlok && t.now - this.startOp >= EERSTE_FRAME_MS) return this.meld("geen-eerste-frame");
      return "ok";
    }
    if (t.frames === null) return "ok";
    if (t.now - this.frameOp >= VAST_MS && this.klokSindsFrame >= VAST_KLOK) return this.meld("frame-vast");
    return "ok";
  }

  // Eén melding per meting; na herstel begint de beller een nieuwe FrameGezondheid.
  private meld(b: FrameBesluit): FrameBesluit {
    this.gemeld = true;
    return b;
  }
}

/** Herstelbudget: max `perVenster` pogingen per `vensterMs` en `totaal` per speler, zodat herstel nooit blijft lussen. */
export class HerstelBudget {
  private pogingen: number[] = [];
  private gebruikt = 0;
  constructor(private perVenster = 2, private vensterMs = 60e3, private totaal = 4) {}
  probeer(now: number): boolean {
    this.pogingen = this.pogingen.filter((x) => now - x < this.vensterMs);
    if (this.pogingen.length >= this.perVenster || this.gebruikt >= this.totaal) return false;
    this.pogingen.push(now);
    this.gebruikt++;
    return true;
  }
}

/** Teller voor de waakhond: rVFC zodra die vuurde, anders de decodeerteller; null = geen teller. */
export function frameTeller(s: { gepresenteerd: number; gedecodeerd: number; rvfc: boolean; decode: boolean }): number | null {
  if (s.rvfc && s.gepresenteerd > 0) return s.gepresenteerd;
  if (s.decode) return s.gedecodeerd;
  return s.rvfc ? 0 : null;
}

/** Beste beschikbare beeldteller zonder rVFC: getVideoPlaybackQuality, anders webkitDecodedFrameCount. */
export function decodeTeller(video: { getVideoPlaybackQuality?: () => { totalVideoFrames: number }; webkitDecodedFrameCount?: number }): number | null {
  const q = video.getVideoPlaybackQuality?.();
  if (q && typeof q.totalVideoFrames === "number") return q.totalVideoFrames;
  return typeof video.webkitDecodedFrameCount === "number" ? video.webkitDecodedFrameCount : null;
}

// Waakhonden van de native speler: stilstaande tijd (Stall) en uitblijvende beelden (FrameGezondheid).
import { useEffect, useRef } from "react";
import { Stall } from "./stall";
import { decodeTeller, FrameGezondheid, frameTeller } from "./framegezondheid";
import { debug as DEBUG, debugEvent } from "./debug";
import { frameTijden } from "./debug-overlay";
import type { Herstel, HlsRef, FrameStand, Pool, VideoMetFrames } from "./feed-speler";
import { diag } from "./feed-speler";

type Gedeeld = { ref: React.RefObject<HTMLVideoElement>; active: boolean; paused: boolean; reloadKey: number; herstel: Herstel; seekOp: React.MutableRefObject<number> };

export function useStallWaakhond({ ref, active, paused, reloadKey, zetBar, herstel, barStand, hlsRef, seekOp }: Gedeeld & {
  zetBar: (tijd: number, duur: number, loopt: boolean) => void;
  barStand: React.MutableRefObject<{ tijd: number; sinds: number; loopt: boolean }>;
  hlsRef: React.MutableRefObject<HlsRef | null>;
}) {
  useEffect(() => {
    const video = ref.current;
    if (!video || !active || paused) return;
    const stall = new Stall();
    let herstelSeek = false;
    const seekKlaar = () => { herstelSeek = false; };
    video.addEventListener("seeked", seekKlaar);
    const iv = window.setInterval(() => {
      const now = performance.now();
      if (herstelSeek && !video.seeking) herstelSeek = false;
      const stand = barStand.current;
      const balkTijd = stand.tijd + (stand.loopt ? (now - stand.sinds) / 1000 : 0);
      let bufferVooruit = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) > video.currentTime) {
          bufferVooruit = video.buffered.end(i) - video.currentTime;
          break;
        }
      }
      const besluit = stall.tik({ now, currentTime: video.currentTime, paused: video.paused,
        hidden: document.hidden, ended: video.ended, seeking: video.seeking, herstelSeek, balkTijd,
        bufferVooruit, readyState: video.readyState, networkState: video.networkState });
      if (besluit === "balk-stop") zetBar(video.currentTime, video.duration, false);
      if (besluit === "balk-sync") zetBar(video.currentTime, video.duration, true);
      if (besluit === "balk-stop" || besluit === "balk-sync" || besluit === "nudge" || besluit === "herlaad") debugEvent(besluit);
      if (besluit === "nudge") {
        diag.stil++;
        const h = hlsRef.current;
        h?.startLoad();
        if (h && video.error?.code === 3) h.recoverMediaError();
        let doel = video.currentTime + 0.01;
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) > video.currentTime + 0.01) {
            doel = video.buffered.start(i);
            break;
          }
          if (video.buffered.end(i) > video.currentTime) break;
        }
        if (Number.isFinite(video.duration)) doel = Math.min(doel, Math.max(0, video.duration - 0.01));
        try {
          herstelSeek = true;
          seekOp.current = now;
          video.currentTime = doel;
          stall.herstelNaar(video.currentTime);
        } catch { herstelSeek = false; }
        video.play().catch(() => {});
      }
      if (besluit === "herlaad") herstel(video, now);
    }, 300);
    return () => {
      window.clearInterval(iv);
      video.removeEventListener("seeked", seekKlaar);
    };
  }, [active, paused, reloadKey, zetBar, herstel]);
}

export function useFrameWaakhond({ ref, gen, pool, slot, kind, src, active, paused, reloadKey, zetBeeld, herstel, seekOp, titel }: Gedeeld & {
  gen: React.MutableRefObject<number>;
  pool: Pool;
  slot: number;
  kind: string;
  src: string;
  zetBeeld: (aan: boolean) => void;
  titel: string;
}) {
  // Beeldteller per bron: rVFC telt gepresenteerde beelden (leidend zodra hij één keer vuurde), de
  // decodeerteller is terugval. Beide blijven aanwijzingen: een compositorfout kan onzichtbaar blijven.
  const frameStand = useRef<FrameStand>({ gepresenteerd: 0, gedecodeerd: 0, op: 0, mediaTijd: -1, rvfc: false, decode: false });
  useEffect(() => {
    const video = ref.current as VideoMetFrames;
    const g = gen.current;
    const stand: FrameStand = { gepresenteerd: 0, gedecodeerd: 0, op: performance.now(), mediaTijd: -1,
      rvfc: !!video.requestVideoFrameCallback, decode: decodeTeller(video) !== null };
    frameStand.current = stand;
    let h = 0;
    let iv = 0;
    if (stand.rvfc) {
      const cb = (_now: number, meta?: { mediaTime?: number }) => {
        if (!pool.eigenaars.actueel(slot, g)) return;
        stand.gepresenteerd++;
        stand.op = performance.now();
        stand.mediaTijd = meta?.mediaTime ?? -1;
        if (video.videoWidth > 0) zetBeeld(true);
        h = video.requestVideoFrameCallback!(cb);
      };
      h = video.requestVideoFrameCallback!(cb);
    }
    if (stand.decode) {
      // Teller van een vorige bron telt niet mee; een reset (bv. na load) geeft een nieuwe basis.
      let basis = decodeTeller(video) ?? 0;
      let decodeSinds = 0;
      let gemeld = false;
      iv = window.setInterval(() => {
        const n = decodeTeller(video);
        if (n === null || !pool.eigenaars.actueel(slot, g)) return;
        if (n < basis) basis = 0;
        const d = n - basis;
        if (d === stand.gedecodeerd) return;
        stand.gedecodeerd = d;
        if (!stand.rvfc || !stand.gepresenteerd) stand.op = performance.now();
        if (d <= 0 || !video.videoWidth) return;
        if (!stand.rvfc) zetBeeld(true);
        else if (!stand.gepresenteerd) {
          // rVFC zwijgt terwijl er gedecodeerd wordt: na 1,5 s toch tonen (en in de debug melden).
          decodeSinds ||= performance.now();
          if (performance.now() - decodeSinds >= 1500 && !video.paused) {
            if (!gemeld) debugEvent("rvfc-stil");
            gemeld = true;
            zetBeeld(true);
          }
        }
      }, 250);
    }
    // Geen enkele teller: dan het oude signaal (eerste beelddata met afmetingen).
    const toon = () => { if (!stand.rvfc && !stand.decode && video.videoWidth > 0) zetBeeld(true); };
    video.addEventListener("loadeddata", toon);
    video.addEventListener("playing", toon);
    if (DEBUG) frameTijden.set(video, () => ({ ...stand, gen: g }));
    return () => {
      if (h && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(h);
      window.clearInterval(iv);
      video.removeEventListener("loadeddata", toon);
      video.removeEventListener("playing", toon);
    };
  }, [kind, src, reloadKey, slot, pool, zetBeeld]);

  // Frame-waakhond: loopt de klok zonder nieuwe beelden, of komt er geen eerste beeld (ook bij breedte 0),
  // dan begrensd herstel op hetzelfde element. Pauze, seek, achtergrond en einde tellen niet.
  useEffect(() => {
    const video = ref.current;
    if (!video || !active || paused) return;
    const fg = new FrameGezondheid();
    const iv = window.setInterval(() => {
      const now = performance.now();
      const st = frameStand.current;
      const besluit = fg.tik({ now, currentTime: video.currentTime, paused: video.paused, hidden: document.hidden,
        seeking: video.seeking, ended: video.ended, seekRecent: now - seekOp.current < 1500,
        frames: frameTeller(st), videoWidth: video.videoWidth, readyState: video.readyState });
      if (besluit === "ok") return;
      debugEvent(besluit);
      diag.vast++;
      if (DEBUG) console.log("[waakhond]", besluit, video.currentTime, titel);
      // Geen herstel meer over: de poster mag een beeld zonder framebewijs niet blijven afdekken.
      if (!herstel(video, now) && besluit === "geen-eerste-frame" && video.videoWidth > 0) zetBeeld(true);
    }, 500);
    return () => window.clearInterval(iv);
  }, [active, paused, reloadKey, titel, herstel, zetBeeld]);
}

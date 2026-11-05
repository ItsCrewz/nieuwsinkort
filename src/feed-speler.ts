// Gedeelde types en toestand van de videospelers: playerprops, voorrang voor het actieve filmpje en de vaste pool.
import type { Video } from "./types";
import { PoolEigenaars, POOL_GROOTTE } from "./videopool";
import type { Bar, SeekRef } from "./feed-balk";

// Tellers voor diagnose van stilstaande tijd en beeld.
export const diag = ((window as unknown as { __nikVideo?: { herladen: number; vast: number; stil: number } }).__nikVideo ??= { herladen: 0, vast: 0, stil: 0 });
diag.stil ??= 0;

export type PlayerProps = {
  v: Video;
  seek: SeekRef;
  active: boolean;
  preload: number; // 0 = niet, 1 = de volgende, 2 = +2 / -1
  paused: boolean;
  muted: boolean;
  bar: Bar;
  onFail: () => void;
  onAutoplayBlocked: () => void;
  /** Er is echt beeld (poster mag weg) of niet meer (poster terug). */
  onBeeld: (beeld: boolean) => void;
};

// ------------------------------------------------------------- voorrang voor het actieve filmpje
// Voorladen begint pas als het filmpje dat je nu kijkt genoeg buffer heeft (of na 1,5 s), zodat de buren
// de bandbreedte niet afsnoepen bij een koude start. Daarna: eerst +1, even later +2 en -1.
let activeReady = false;
let readyTimer = 0;
const waiters = new Set<() => void>();
export function signalReady() {
  if (activeReady) return;
  activeReady = true;
  window.clearTimeout(readyTimer);
  const ws = [...waiters];
  waiters.clear();
  ws.forEach((f) => f());
}
export function resetReady() {
  activeReady = false;
  window.clearTimeout(readyTimer);
  readyTimer = window.setTimeout(signalReady, 1500);
}
export function whenReady(fn: () => void, delay = 0) {
  let t = 0;
  const run = () => {
    t = window.setTimeout(fn, delay);
  };
  if (activeReady) run();
  else waiters.add(run);
  return () => {
    waiters.delete(run);
    window.clearTimeout(t);
  };
}

// ------------------------------------------------------------- vaste videopool (#50)
// iOS laat maar een paar decoders tegelijk toe en onthoudt per element of het mag spelen. Daarom precies
// POOL_GROOTTE <video>-elementen, één keer gemaakt en geparkeerd in .f-park als ze niet in een slide staan.
export type Pool = { els: HTMLVideoElement[]; park: HTMLDivElement; eigenaars: PoolEigenaars };
export function maakPool(): Pool {
  const park = document.createElement("div");
  park.className = "f-park";
  park.hidden = true;
  const els = Array.from({ length: POOL_GROOTTE }, (_, slot) => {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.setAttribute("webkit-playsinline", "");
    el.loop = true;
    el.dataset.slot = String(slot);
    park.appendChild(el);
    return el;
  });
  return { els, park, eigenaars: new PoolEigenaars() };
}

export type VideoMetFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta?: { mediaTime?: number; presentedFrames?: number }) => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
  webkitDecodedFrameCount?: number;
};
export type FrameStand = { gepresenteerd: number; gedecodeerd: number; op: number; mediaTijd: number; rvfc: boolean; decode: boolean };

export type HlsRef = { config: { maxBufferLength: number; maxMaxBufferLength: number; maxBufferSize: number }; startLoad: (p?: number) => void; recoverMediaError: () => void };
export type Herstel = (video: HTMLVideoElement, now: number) => boolean;

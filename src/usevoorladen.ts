// Haakt voorladen.ts aan de app: één keer per sessie, opnieuw alleen als data.gegenereerd verandert.
import { useEffect, useRef } from "react";
import type { Video } from "./types";
import { naIdle, planVoorladen, voerUit } from "./voorladen";
import { playerFor, soortVan, startSoort, viaProxy } from "./videosoort";

type Lijsten = { filmpjes: Video[]; dumpert: Video[] } | null;
let laatste = "";
let laatsteVideo = "";
// Intentie om naar Filmpjes/Dumpert te gaan: aanraken, aanwijzen of focussen van die tab (data-video-tab)
const INTENTIE = ["pointerdown", "touchstart", "focusin", "mouseover"];
const opTab = (t: EventTarget | null) => !!(t as Element | null)?.closest?.("[data-video-tab]");

export function useVoorladen(vids: Lijsten, gegenereerd: string | undefined, opVideo: boolean) {
  const nu = useRef({ vids, opVideo });
  nu.current = { vids, opVideo };
  const klaar = !!vids;
  useEffect(() => {
    if (!klaar || !gegenereerd) return;
    const run = (video: boolean) => {
      const { vids: l, opVideo: direct } = nu.current;
      if (!l || direct) return false;
      // zoals de UI het toont: Filmpjes opent in de startsoort, met de actieve filters
      const s = startSoort(l.filmpjes);
      const apple = /Apple/.test(navigator.vendor || "") || /iP(hone|ad|od)/.test(navigator.userAgent);
      const plan = planVoorladen(l.filmpjes.filter((v) => soortVan(v) === s), l.dumpert, apple, { playerFor, viaProxy }, video);
      voerUit(plan);
      // een intentie telt pas als er videowerk is gestart; bij een leeg plan blijft een latere intentie mogelijk
      return !video || plan.hlsChunk || plan.hls.length > 0 || !!plan.mp4 || plan.preconnect.length > 0;
    };
    // video (chunk, playlists, segmenten, mp4) pas bij intentie; op Home blijft het bij thumbs
    const intent = (e: Event) => {
      if (gegenereerd === laatsteVideo || !opTab(e.target) || !run(true)) return;
      laatsteVideo = gegenereerd;
      ruim();
    };
    const ruim = () => INTENTIE.forEach((n) => document.removeEventListener(n, intent, true));
    if (gegenereerd !== laatsteVideo) INTENTIE.forEach((n) => document.addEventListener(n, intent, true));
    const stop = gegenereerd === laatste ? () => {} : naIdle(() => {
      if (gegenereerd === laatste) return;
      laatste = gegenereerd;
      run(false);
    });
    return () => {
      stop();
      ruim();
    };
  }, [klaar, gegenereerd]);
}

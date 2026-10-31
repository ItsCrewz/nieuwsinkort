// Haakt voorladen.ts aan de app: één keer per sessie, opnieuw alleen als data.gegenereerd verandert.
import { useEffect, useRef } from "react";
import type { Video } from "./types";
import { naIdle, planVoorladen, voerUit } from "./voorladen";
import { playerFor, soortVan, startSoort, viaProxy } from "./videosoort";

type Lijsten = { filmpjes: Video[]; dumpert: Video[] } | null;
let laatste = "";

export function useVoorladen(vids: Lijsten, gegenereerd: string | undefined, opVideo: boolean) {
  const nu = useRef({ vids, opVideo });
  nu.current = { vids, opVideo };
  const klaar = !!vids;
  useEffect(() => {
    if (!klaar || !gegenereerd || gegenereerd === laatste) return;
    return naIdle(() => {
      const { vids: l, opVideo: direct } = nu.current;
      if (!l || direct || gegenereerd === laatste) return;
      laatste = gegenereerd;
      // zoals de UI het toont: Filmpjes opent in de startsoort, met de actieve filters
      const s = startSoort(l.filmpjes);
      const apple = /Apple/.test(navigator.vendor || "") || /iP(hone|ad|od)/.test(navigator.userAgent);
      voerUit(planVoorladen(l.filmpjes.filter((v) => soortVan(v) === s), l.dumpert, apple, { playerFor, viaProxy }));
    });
  }, [klaar, gegenereerd]);
}

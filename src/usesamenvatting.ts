// Hook voor het samenvattingsblad: haalt per filmpje op, annuleert bij sluiten of wisselen en negeert verlaten antwoorden.
import { useEffect, useState } from "react";
import { svCache, haalSamenvatting, type Sv } from "./samenvattingcache";

export function useSamenvatting(id: string): { res: Sv | null; opnieuw: () => void } {
  const [res, setRes] = useState<Sv | null>(() => svCache.get(id) || null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (svCache.has(id) && n === 0) { setRes(svCache.get(id) || null); return; }
    const ac = new AbortController();
    setRes(null);
    haalSamenvatting(id, ac.signal).then((r) => { if (!ac.signal.aborted) setRes(r); }, () => {});
    return () => ac.abort();
  }, [id, n]);
  return { res, opnieuw: () => { svCache.delete(id); setN((x) => x + 1); } };
}

import { useEffect, useState } from "react";
import type { Item, Meer } from "./types";
import { prefetchMeer } from "./meer";

export function useMeer(item: Item): { meer: Meer | null; laden: boolean } {
  const [st, setSt] = useState<{ k?: string; meer: Meer | null; laden: boolean }>({ meer: null, laden: !!item.meer });
  useEffect(() => {
    let weg = false;
    if (!item.meer) { setSt({ meer: null, laden: false }); return; }
    setSt({ k: item.meer, meer: null, laden: true });
    prefetchMeer(item).then((m) => { if (!weg) setSt({ k: item.meer, meer: m, laden: false }); });
    return () => { weg = true; };
  }, [item]);
  return st.k === item.meer ? st : { meer: null, laden: !!item.meer };
}


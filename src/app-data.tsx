import { useCallback,useEffect,useLayoutEffect,useRef,useState } from "react";
import { sorteerOpGroep } from "./filmgroep";
import { herindeel } from "./regio";
import { zaaiSamenvattingen } from "./samenvattingcache";
import { schoon } from "./schoon";
import type { Data } from "./types";
import { valideer } from "./valideer";
import { kiesNieuweData,verwijderGisteren } from "./vandaag";
import { playerFor,soortVan } from "./videosoort";
import { laadData,neemVroegeData } from "./vroeg";

 // op "Home" eerst zoveel kaarten, daarna "Toon alle"
export const THEME_KEY = "nieuwsinkort-thema";


export const afwijzingen = { aantal: 0 };

// ---------------------------------------------------------------- data + thema
export function useData() {
  const volgnummer = useRef(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const aanvraag = ++volgnummer.current;
    try {
      const antwoord = await laadData(neemVroegeData());
      if (aanvraag !== volgnummer.current) return;
      const gevalideerd = valideer(antwoord);
      afwijzingen.aantal = gevalideerd.afgewezen;
      const d = schoon(gevalideerd.data as Data); // ook hier ontdubbelen: statische data zonder Pages Function
      d.items ??= [];
      d.items = d.items.map(herindeel); // ook statische/oude data: buitenland uit "nl" halen
      d.filmpjes ??= [];
      zaaiSamenvattingen(d.samenvattingen);
      d.dumpert ??= [];
      d.dumpert = d.dumpert.filter((v) => !!playerFor(v)); // alleen echte, afspeelbare filmpjes
      d.filmpjes = sorteerOpGroep(d.filmpjes.map((v) => ({ ...v, soort: soortVan(v) }))); // Shorts of Journaals; op onderwerpgroep (#459): Sport onderaan, ook voor de volgorde van doorlopend kijken
      setData((prev) => kiesNieuweData(prev, verwijderGisteren(d, Date.now())));
      setError(false);
    } catch {
      if (aanvraag === volgnummer.current) setError(true);
    }
  }, []);
  useEffect(() => {
    load();
    // ververs als je terugkomt op het tabblad, en elk kwartier
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(load, 15 * 60 * 1000);
    const grens = window.setInterval(() => setData((d) => d && verwijderGisteren(d, Date.now())), 1000);
    return () => {
      volgnummer.current++;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
      window.clearInterval(grens);
    };
  }, [load]);
  return { data, error, reload: load };
}


export type Theme = "light" | "dark";

export function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "dark" ? "#0f0f0f" : "#ffffff"));
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || savedTheme() || systemTheme());
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => {
      if (!savedTheme()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  // Direct wisselen: geen kleurovergang op elk element (dat hapert), één repaint en klaar.
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* negeer */
    }
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggle };
}

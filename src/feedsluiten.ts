// Sluiten van de videofeed (#648): onClose precies één keer, ook bij dubbel tikken, herhaald Escape, timer + animationend.
// Pure logica (zonder React/DOM) zodat tests de timers en de twee sluitroutes (intern geopend of directe link) kunnen aansturen.
export type Sluiter = { sluit: () => void; rondAf: () => void; opruimen: () => void };
type Opties = {
  rustig: () => boolean;
  onClose: () => void;
  start: () => void; // zet de sluitanimatie aan
  zet?: (f: () => void, ms: number) => number;
  wis?: (id: number) => void;
  ms?: number;
};

export function maakSluiter(o: Opties): Sluiter {
  const zet = o.zet ?? ((f, ms) => window.setTimeout(f, ms));
  const wis = o.wis ?? ((id) => window.clearTimeout(id));
  let timer: number | null = null;
  let klaar = false;
  const opruimen = () => { if (timer !== null) { wis(timer); timer = null; } };
  const rondAf = () => {
    if (klaar) return;
    klaar = true;
    opruimen();
    o.onClose();
  };
  const sluit = () => {
    if (klaar || timer !== null) return;
    if (o.rustig()) return rondAf();
    o.start();
    timer = zet(rondAf, o.ms ?? 220);
  };
  return { sluit, rondAf, opruimen };
}

type Venster = { location: { pathname: string; search: string; replace(u: string): void }; history: { back(): void } };

// Sluiten van een intern geopende feed (history.back) of een directe videolink (replace naar het overzicht); één navigatie per open.
export function maakFeedNavigatie(w: Venster) {
  let intern = false;
  return {
    geopend: (vanuitOverzicht: boolean) => { intern = vanuitOverzicht; },
    sluit: (cat: "filmpjes" | "dumpert") => {
      if (intern) { intern = false; w.history.back(); }
      else w.location.replace(`${w.location.pathname}${w.location.search}#/${cat}`);
    },
  };
}

// Trek-om-te-verversen (#540) in de nieuwsfeed: pure regels (drempel, weerstand, rem) + de hook.
// Kost niets extra: loslaten roept de bestaande load() aan (één /data.json met no-cache + ETag), geen AI, geen KV-writes.
import { useEffect, useRef, useState, type RefObject } from "react";
import { DUUR, rustig } from "./beweging";

export const DREMPEL = 56; // px trekafstand (na weerstand) om te verversen
export const MAX_TREK = 72; // px, de indicator gaat niet verder
export const WEERSTAND = 0.5;
export const REM_MS = 30_000; // hooguit één verversing per 30 s
export const STATUS_MS = 1200;
const UIT = -44; // px, verborgen stand boven de rand

export type Besluit = "geen" | "ververs" | "bij";

/** Afstand die de indicator volgt: vingerafstand met weerstand, begrensd. */
export const trekAfstand = (dy: number) => (dy > 0 ? Math.min(dy * WEERSTAND, MAX_TREK) : 0);
/** 0..1, voor de pijl (rotate(progress*180deg)). */
export const voortgang = (afstand: number) => Math.max(0, Math.min(1, afstand / DREMPEL));
export const overDrempel = (afstand: number) => afstand >= DREMPEL;
/** Rem: mag er (weer) ververst worden? `laatste` = tijdstip van de vorige verversing. */
export const magVerversen = (laatste: number | null, nu: number) => laatste === null || nu - laatste >= REM_MS;
/** Bij loslaten: onder de drempel niets; daarboven verversen, binnen de rem alleen "Je bent bij". */
export function besluit(afstand: number, laatste: number | null, nu: number): Besluit {
  if (!overDrempel(afstand)) return "geen";
  return magVerversen(laatste, nu) ? "ververs" : "bij";
}

/** load() geeft true als `gegenereerd` nieuwer is, false als gelijk, null bij een fout. */
export type Ververs = () => Promise<boolean | null>;

const tijdTekst = (nu: Date) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(nu);

/** Alleen touch, alleen op scrollTop 0. Alleen de indicator beweegt (transform/opacity), niet de scroller; alle listeners zijn passief.
 *  `ververs` undefined = uit (bijv. bij een fout met "Probeer opnieuw"). Geeft de statustekst terug. */
export function useTrekVerversen(scroller: RefObject<HTMLElement | null>, ptr: RefObject<HTMLElement | null>, ververs?: Ververs) {
  const [tekst, setTekst] = useState("");
  const verversRef = useRef(ververs);
  verversRef.current = ververs;
  const laatste = useRef<number | null>(null);
  useEffect(() => {
    const el = scroller.current;
    const p = ptr.current;
    if (!el || !p) return;
    let y0: number | null = null;
    let afstand = 0;
    let bezig = false;
    let los = false;
    let timer = 0;
    const veer = (stand: number, zichtbaar: boolean) => {
      p.style.transition = "transform var(--dur-3) var(--ease-uit), opacity var(--dur-3) var(--ease-uit)";
      p.style.opacity = zichtbaar ? "1" : "0";
      p.style.transform = `translate(-50%, ${stand}px)`;
    };
    const terug = () => {
      veer(UIT, false);
      p.classList.remove("klaar");
      p.style.setProperty("--draai", "0deg");
      los = false;
    };
    const start = (e: TouchEvent) => {
      if (bezig || !verversRef.current || e.touches.length !== 1 || el.scrollTop > 0) { y0 = null; return; }
      y0 = e.touches[0].clientY;
      afstand = 0;
    };
    const beweeg = (e: TouchEvent) => {
      if (y0 === null) return;
      if (el.scrollTop > 0 || e.touches.length !== 1) { y0 = null; terug(); return; }
      afstand = trekAfstand(e.touches[0].clientY - y0);
      if (afstand <= 0) { terug(); setTekst(""); return; }
      const klaar = overDrempel(afstand);
      p.classList.toggle("klaar", klaar);
      if (rustig()) {
        // reduced motion: de indicator volgt de vinger niet; over de drempel staat hij statisch met uitleg
        if (klaar !== los) {
          los = klaar;
          p.style.transition = "none";
          p.style.transform = `translate(-50%, ${klaar ? 0 : UIT}px)`;
          p.style.opacity = klaar ? "1" : "0";
          setTekst(klaar ? "Loslaten om te verversen" : "");
        }
        return;
      }
      p.style.transition = "none";
      p.style.opacity = String(Math.min(1, afstand / 24));
      p.style.transform = `translate(-50%, ${afstand + UIT}px)`;
      p.style.setProperty("--draai", `${voortgang(afstand) * 180}deg`);
    };
    const eind = async () => {
      if (y0 === null) return;
      y0 = null;
      const b = besluit(afstand, laatste.current, Date.now());
      const f = verversRef.current;
      afstand = 0;
      if (b === "geen" || !f) { terug(); setTekst(""); return; }
      veer(0, true); // blijft staan voor de status
      p.classList.remove("klaar");
      bezig = true;
      let status = "Je bent bij";
      if (b === "ververs") {
        laatste.current = Date.now();
        setTekst("Verversen…");
        const nieuw = await f();
        if (nieuw === null) status = "Verversen lukt even niet";
        else if (nieuw) status = `Bijgewerkt om ${tijdTekst(new Date())}`;
      }
      setTekst(status);
      timer = window.setTimeout(() => { bezig = false; terug(); window.setTimeout(() => setTekst(""), DUUR[3]); }, STATUS_MS);
    };
    const annuleer = () => { if (y0 === null) return; y0 = null; afstand = 0; terug(); setTekst(""); };
    const opt: AddEventListenerOptions = { passive: true };
    el.addEventListener("touchstart", start, opt);
    el.addEventListener("touchmove", beweeg, opt);
    el.addEventListener("touchend", eind, opt);
    el.addEventListener("touchcancel", annuleer, opt);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", beweeg);
      el.removeEventListener("touchend", eind);
      el.removeEventListener("touchcancel", annuleer);
    };
  }, [scroller, ptr]);
  return tekst;
}

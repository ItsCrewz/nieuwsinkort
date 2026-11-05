import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Foutgrens, registreerClientfouten } from "./foutgrens";
import { startAnalytics } from "./analytics";
import "./index.css";
import { parsePad } from "./artikelid";

// Gedeelde link /bericht/<dag>/<id>-<slug> (serverpagina): open dezelfde artikelweergave als in de app, met de home erachter
// (sluiten of terugvegen gaat dan naar het overzicht).
const gedeeld = parsePad(window.location.pathname);
if (gedeeld) {
  window.history.replaceState(null, "", "/#/");
  window.history.pushState({ binnen: true }, "", `/#/bericht/${gedeeld.id}`);
}

registreerClientfouten(window);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Foutgrens code="CLIENT_APP"><App /></Foutgrens>
  </StrictMode>
);

requestAnimationFrame(() => requestAnimationFrame(() => startAnalytics()));

// Beweging-CSS (transities, animaties, View Transitions) pas na de eerste paint: houdt de kritieke CSS onder budget. Layout blijft in index.css.
// Het toepassen van de sheet start animaties op elementen die al staan (bijv. .nf-start.off, een open videofeed): die zouden opnieuw infaden/flitsen.
// Daarom houden we de sheet uitgeschakeld (media="not all") tot hij geladen is, nemen dan in dezelfde taak een momentopname, schakelen hem in en annuleren alleen
// de eindige animaties op echte elementen die daardoor ontstaan (View-Transition-pseudo's laten we met rust). Animaties van gebruikersinteractie (artikelovergang, kaartentree) staan in de momentopname of starten later: die lopen door.
const laadBeweging = () => {
  let knoop: (HTMLLinkElement | HTMLStyleElement) | null = null;
  const kijk = new MutationObserver((lijst) => {
    for (const m of lijst) for (const n of m.addedNodes) {
      if (knoop || !(n instanceof HTMLLinkElement || n instanceof HTMLStyleElement)) continue;
      if (/uitgesteld/.test(n instanceof HTMLLinkElement ? n.href : n.getAttribute("data-vite-dev-id") || "")) { knoop = n; n.media = "not all"; }
    }
  });
  kijk.observe(document.head, { childList: true });
  import("./uitgesteld.css").then(() => {
    kijk.disconnect();
    const bestond = new Set(document.getAnimations());
    if (knoop) (knoop as HTMLLinkElement).media = "all";
    for (const a of document.getAnimations()) if (!bestond.has(a) && !(a.effect as KeyframeEffect | null)?.pseudoElement && a.effect?.getComputedTiming().iterations !== Infinity) a.cancel();
  }).catch(() => kijk.disconnect());
};
const naPaint = () => (window.requestIdleCallback ? window.requestIdleCallback(laadBeweging, { timeout: 1500 }) : window.setTimeout(laadBeweging, 200));
requestAnimationFrame(() => requestAnimationFrame(() => (document.readyState === "complete" ? naPaint() : window.addEventListener("load", naPaint, { once: true }))));

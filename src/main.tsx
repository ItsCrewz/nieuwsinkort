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
const laadBeweging = () => { import("./uitgesteld.css").catch(() => {}); };
const naPaint = () => (window.requestIdleCallback ? window.requestIdleCallback(laadBeweging, { timeout: 1500 }) : window.setTimeout(laadBeweging, 200));
requestAnimationFrame(() => requestAnimationFrame(() => (document.readyState === "complete" ? naPaint() : window.addEventListener("load", naPaint, { once: true }))));

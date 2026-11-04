import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Foutgrens, registreerClientfouten } from "./foutgrens";
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

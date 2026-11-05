import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Foutgrens, registreerClientfouten } from "./foutgrens";
import { startAnalytics } from "./analytics";
import "./index.css";
import { openGedeeld } from "./gedeeldelink";

openGedeeld(window);

registreerClientfouten(window);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Foutgrens code="CLIENT_APP"><App /></Foutgrens>
  </StrictMode>
);

requestAnimationFrame(() => requestAnimationFrame(() => startAnalytics()));

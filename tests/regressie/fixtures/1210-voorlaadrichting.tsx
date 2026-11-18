import React from "react";
import { createRoot } from "react-dom/client";
import { Beelden } from "../../../src/beelden";

createRoot(document.getElementById("root")!).render(
  <div className="nf">{Array.from({ length: 12 }, (_, i) =>
    <div className="kaart" key={i}><Beelden urls={[`https://beelden.test/${i}.svg`, `https://beelden.test/${i}-tweede.svg`]} /></div>
  )}</div>
);

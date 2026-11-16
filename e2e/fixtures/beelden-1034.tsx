import React from "react";
import { createRoot } from "react-dom/client";
import { Beelden } from "../../src/beelden";

const urls = (kaart: number) => [0, 1, 2].map((foto) => `https://beelden.test/${kaart}-${foto}.svg`);
createRoot(document.getElementById("root")!).render(<><Beelden urls={urls(0)} /><div style={{ height: "2000px" }} /><Beelden urls={urls(1)} /></>);

import React from "react";
import { createRoot } from "react-dom/client";
import { Beelden, Thumb } from "../../src/beelden";

const urls = (kaart: number) => [0, 1, 2].map((foto) => `https://beelden.test/${kaart}-${foto}.svg`);
createRoot(document.getElementById("root")!).render(<><Beelden className="nc-img" urls={urls(0)} /><Thumb urls={["https://beelden.test/thumb-zichtbaar.svg"]} /><div style={{ height: "2000px" }} /><Beelden className="nc-img" urls={urls(1)} /><Thumb urls={["https://beelden.test/thumb-verder.svg"]} /></>);

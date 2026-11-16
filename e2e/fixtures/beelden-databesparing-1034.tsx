import { createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { Beelden } from "../../src/beelden";

const kaart = (urls: string[]) => createElement("div", { style: { height: "120vh" } }, createElement(Beelden, { urls }));
createRoot(document.getElementById("root")!).render(createElement(Fragment, null,
  kaart(["https://voorbeeld.test/besparing-eerste.svg", "https://voorbeeld.test/besparing-tweede.svg", "https://voorbeeld.test/besparing-derde.svg"]),
  kaart(["https://voorbeeld.test/besparing-volgende.svg"])));

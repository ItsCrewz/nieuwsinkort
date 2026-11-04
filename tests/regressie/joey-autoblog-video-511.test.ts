import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DetailView } from "../../src/detail";
import type { Item } from "../../src/types";
import item from "../fixtures/joey/autoblog-511.json";

const render = (bericht: Item) => renderToStaticMarkup(createElement(DetailView, { item: bericht, onBack: () => {}, bionic: false }));
const html = render(item as Item);
assert.match(html, /href="https:\/\/www\.autoblog\.nl\/video\/auto-rijdt-doorgetrokken-streep-over-lanceert-motor"[^>]*>Bekijk video bij Autoblog\.nl/);
assert.doesNotMatch(render({ ...item, cat: "auto", bronnen: [{ site: "Autoblog.nl", href: "https://www.autoblog.nl/nieuws/voorbeeld" }] } as Item), /Bekijk video bij/);
assert.doesNotMatch(render({ ...item, cat: "auto", bronnen: [{ site: "Onveilig", href: "javascript://voorbeeld/video/123" }] } as Item), /Bekijk video bij/);
console.log("Autoblog-preview biedt een veilige videolink naar de bron");

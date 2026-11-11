// Videotabs in Feed (#791): precies één tabstop en die staat op de geselecteerde tab.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { zetNepDom } from "./hulp/nepdom";
import type { Video } from "../src/types";

const iso = new Date().toISOString();
const video = (n: number, soort: Video["soort"]): Video => ({
  titel: `Tabtest video ${n}`, ai: `Video ${n} kort`, bron: "Bron", href: `https://www.dumpert.nl/item/${n}_abc`,
  thumb: `https://media.dumpert.nl/thumb/${n}.jpg`, populariteit: "1000", tijd: iso, soort,
  embed: `https://media.dumpert.nl/video/${n}.mp4`,
});
const dom = zetNepDom({});
const { createRoot } = await import("react-dom/client");
const { Feed } = await import("../src/feed");
const container = dom.doc.createElement("div");
dom.doc.body.appendChild(container);
const root = createRoot(container as unknown as Element);
const groups = [
  { id: "short", label: "Shorts", list: [1, 2].map((n) => video(n, "short")) },
  { id: "journaal", label: "Journaal", list: [3, 4].map((n) => video(n, "journaal")) },
];
await act(async () => root.render(createElement(Feed, { list: groups[0].list, cat: "filmpjes", start: null, onClose: () => {}, groups })));
const tabs = dom.doc.body.vind((n) => n.nodeType === 1 && n.attrs.get("role") === "tab");
assert.equal(tabs.length, 2, "twee tabs");
const stops = tabs.filter((n) => n.attrs.get("tabindex") === "0");
assert.equal(stops.length, 1, "één tabstop");
assert.equal(stops[0].attrs.get("aria-selected"), "true", "de tabstop is de geselecteerde tab");
assert.equal(tabs.filter((n) => n.attrs.get("aria-selected") === "true").length, 1);
await act(async () => root.unmount());
console.log("videotabs in Feed geslaagd");

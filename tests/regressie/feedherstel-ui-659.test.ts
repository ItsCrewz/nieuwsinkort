// #659: een open feed volgt ook latere wijzigingen van de actuele lijst.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { zetNepDom } from "../hulp/nepdom";
import { videoSlug } from "../../src/slug";
import type { Video } from "../../src/types";

const dom = zetNepDom({});
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
Object.assign(globalThis, { location: window.location, history: window.history });
const { createRoot } = await import("react-dom/client");
const { VideoGrid } = await import("../../src/video");
const videos: Video[] = ["een", "twee", "drie"].map((titel) => ({ titel, bron: "Dumpert", href: `https://www.dumpert.nl/item/${titel}`, embed: `https://voorbeeld.nl/${titel}.mp4`, soort: "short" }));
let gesloten = 0;
const root = createRoot(dom.container as unknown as Element);
const render = (list: Video[]) => root.render(createElement(VideoGrid, {
  list, cat: "dumpert", bionic: false, bronFilter: false, enter: false,
  video: videoSlug(videos[0]), onOpen: () => {}, onCloseFeed: () => { gesloten++; },
}));
const slides = () => dom.doc.body.vind((n) => (n.attrs.get("class") ?? "").split(" ").includes("fslide"));
await act(async () => { render(videos); });
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
assert.equal(slides().length, 3);
await act(async () => { render([videos[1]]); });
assert.equal(slides().length, 1, "verwijderde videos verdwijnen uit de open feed");
assert.match(slides()[0].textContent, /twee/);
await act(async () => { render([]); });
assert.equal(slides().length, 0, "een lege actuele lijst sluit de feed");
assert.equal(gesloten, 1);
await act(async () => root.unmount());
console.log("✓ open videofeed volgt actuele lijst (#659)");

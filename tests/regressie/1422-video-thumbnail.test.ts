import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { zetNepDom } from "../hulp/nepdom";
import type { Video } from "../../src/types";
import { viaProxy } from "../../src/videosoort";

const fixture = JSON.parse(readFileSync("tests/fixtures/filmpjes-live-31-10.json", "utf8")) as { filmpjes: Video[] };
const video = fixture.filmpjes[0];
const dom = zetNepDom({});
const { createRoot } = await import("react-dom/client");
const { VideoGrid } = await import("../../src/video");
const root = createRoot(dom.container as unknown as Element);
const toon = (v: Video) => act(async () => root.render(createElement(VideoGrid, {
  list: [v], cat: "filmpjes", bionic: false, bronFilter: false, enter: false,
  video: null, onOpen: () => {}, onCloseFeed: () => {},
})));
const img = () => dom.container.vind((n) => n.nodeName === "img")[0];
const terugval = () => dom.container.vind((n) => n.getAttribute("class") === "vthumb-name")[0];

await toon(video);
assert.equal(img().getAttribute("src"), viaProxy(video.thumb!));
const sleutel = Object.keys(img()).find((k) => k.startsWith("__reactProps$"));
assert.ok(sleutel);
await act(async () => img()[sleutel].onError());
assert.equal(img(), undefined);
assert.equal(terugval().textContent, video.bron);
await toon({ ...video });
assert.equal(img(), undefined, "een ongewijzigde kapotte URL wordt niet opnieuw geladen");
assert.ok(terugval());
const nieuweUrl = `${video.thumb}?vernieuwd=1`;
await toon({ ...video, thumb: nieuweUrl });
assert.equal(img().getAttribute("src"), viaProxy(nieuweUrl));
assert.equal(terugval(), undefined);
await act(async () => root.unmount());
console.log("✓ videothumbnail krijgt een nieuwe poging bij een gewijzigde URL (#1422)");

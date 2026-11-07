import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { zetNepDom, type Knoop } from "../hulp/nepdom";
import type { Video } from "../../src/types";
import { VideoGrid } from "../../src/video";

const video: Video = JSON.parse(readFileSync("tests/regressie/fixtures/video-miniatuur-790.json", "utf8"));
const dom = zetNepDom({});
const { createRoot } = await import("react-dom/client");
const root = createRoot(dom.container as unknown as Element);
const render = (v: Video) => act(async () => root.render(createElement(VideoGrid, {
  list: [v], cat: "filmpjes", bionic: false, bronFilter: false, enter: false, video: null,
  onOpen: () => {}, onCloseFeed: () => {},
})));
const plaatjes = () => dom.container.vind((n) => n.nodeName === "img");
const fout = (n: Knoop) => {
  const sleutel = Object.keys(n).find((k) => k.startsWith("__reactProps$"));
  assert.ok(sleutel);
  return n[sleutel].onError as () => void;
};

await render(video);
const oud = plaatjes()[0];
assert.ok(oud);
const oudeFout = fout(oud);
await act(async () => oudeFout());
assert.equal(plaatjes().length, 0);
assert.match(dom.container.html, /vthumb-name/);
await render({ ...video });
assert.equal(plaatjes().length, 0, "dezelfde mislukte URL wordt niet opnieuw geladen");

const nieuw = { ...video, thumb: "https://i.ytimg.com/vi/Q43HA26tzlY/mqdefault.jpg" };
await render(nieuw);
const beeld = plaatjes()[0];
assert.ok(beeld);
assert.equal(beeld.getAttribute("src"), nieuw.thumb);
await act(async () => oudeFout());
assert.equal(plaatjes()[0], beeld, "een late fout van de oude aanvraag raakt het nieuwe beeld niet");
await render({ ...nieuw, titel: "Bijgewerkte titel" });
assert.equal(plaatjes()[0], beeld, "een werkend beeld blijft behouden bij dezelfde URL");
await act(async () => root.unmount());
console.log("✓ miniatuur herstelt bij nieuwe URL en negeert oude fouten");

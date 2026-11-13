import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { Beelden, bronUrl } from "../../src/beelden";
import { schoon } from "../../src/schoon";
import { zetNepDom, type Knoop } from "../hulp/nepdom";

const echt = JSON.parse(readFileSync("tests/fixtures/joey/nu-geheugen.json", "utf8")).beelden[0] as string;
const urls = [...Array.from({ length: 6 }, (_, i) => echt.replace("i9bxconai3q5", `reserve${i}`)), echt];
const data = schoon({ items: [{ beelden: [...urls, urls[0]] }] });
assert.deepEqual(data.items[0].beelden, urls);
const dom = zetNepDom({});
const { createRoot } = await import("react-dom/client");
const root = createRoot(dom.container as unknown as Element);
const toon = (beelden: string[]) => act(async () => root.render(createElement(Beelden, { urls: beelden, eager: true })));
const imgs = () => dom.container.vind((n) => n.nodeName === "img");
const slides = () => dom.container.vind((n) => n.getAttribute("class") === "bl-slide");
const gebeurtenis = (n: Knoop, naam: string) => {
  const sleutel = Object.keys(n).find((k) => k.startsWith("__reactProps$"));
  assert.ok(sleutel);
  n[sleutel][naam]({ currentTarget: n });
};
await toon(data.items[0].beelden);
assert.equal(slides().length, 6);
assert.ok(imgs().length < urls.length);
for (const u of urls.slice(0, 6)) {
  const img = imgs()[0];
  assert.equal(img.getAttribute("src"), bronUrl(u));
  await act(async () => gebeurtenis(img, "onError"));
  assert.equal(imgs()[0].getAttribute("src"), u, "proxy valt eenmaal terug op rechtstreeks");
  await act(async () => gebeurtenis(imgs()[0], "onError"));
  assert.ok(slides().length <= 6);
}
assert.equal(imgs()[0].getAttribute("src"), bronUrl(echt));
await act(async () => { imgs()[0].naturalWidth = 800; imgs()[0].naturalHeight = 600; gebeurtenis(imgs()[0], "onLoad"); });
assert.equal(slides().length, 1);
await act(async () => gebeurtenis(imgs()[0], "onError"));
await act(async () => gebeurtenis(imgs()[0], "onError"));
assert.equal(slides().length, 0);
await toon(data.items[0].beelden);
assert.equal(slides().length, 0, "dezelfde kandidaten starten niet opnieuw");
await act(async () => root.unmount());
console.log("✓ reservefoto volgt na uitval en uitputting stopt");

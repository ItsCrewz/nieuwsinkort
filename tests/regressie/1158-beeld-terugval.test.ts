import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { Beelden, Thumb, MAX_BEELD_ADMIN, aantalBeeldAdmin, naarRechtstreeks } from "../../src/beelden";
import { beeldViaProxy } from "../../src/beeldhost";
import { zetNepDom, type Knoop } from "../hulp/nepdom";

const feed = readFileSync("tests/fixtures/tg-wijndal-item.xml", "utf8");
const url = feed.match(/<enclosure url="([^"]+)"/)?.[1];
assert.ok(url);
const dom = zetNepDom({});
const { createRoot } = await import("react-dom/client");
const root = createRoot(dom.container as unknown as Element);
const img = () => dom.container.vind((n) => n.nodeName === "img")[0];
const fout = (n: Knoop) => {
  const sleutel = Object.keys(n).find((k) => k.startsWith("__reactProps$"));
  assert.ok(sleutel);
  n[sleutel].onError({ currentTarget: n });
};

for (const Component of [Thumb, Beelden]) {
  const toon = () => act(async () => root.render(createElement(Component, { urls: [url], ...(Component === Beelden ? { eager: true } : {}) })));
  await toon();
  assert.equal(img().getAttribute("src"), beeldViaProxy(url));
  await act(async () => fout(img()));
  assert.equal(img().getAttribute("src"), url);
  for (let i = 0; i <= MAX_BEELD_ADMIN; i++) {
    const ander = `https://images.nu.nl/storing-${i}.jpg`;
    naarRechtstreeks(ander, beeldViaProxy(ander));
  }
  assert.ok(aantalBeeldAdmin().rechtstreeks <= MAX_BEELD_ADMIN);
  assert.equal(img().getAttribute("src"), url, "zichtbaar beeld blijft rechtstreeks tijdens opruimen");
  // Een nieuwe props-array veroorzaakt een her-render zonder de component te vervangen.
  await act(async () => root.render(createElement(Component, { urls: [url], ...(Component === Beelden ? { eager: true, className: "anders" } : {}) })));
  assert.equal(img().getAttribute("src"), url, "ook na een her-render blijft de terugval behouden");
  await act(async () => fout(img()));
  assert.equal(img(), undefined, "een mislukte rechtstreekse poging veroorzaakt geen lus");
  await act(async () => root.render(null));
}
await act(async () => root.unmount());
console.log("✓ zichtbaar beeld behoudt rechtstreekse terugval bij opruimen");

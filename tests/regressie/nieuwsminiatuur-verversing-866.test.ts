import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { Thumb, bronUrl } from "../../src/beelden";
import { zetNepDom, type Knoop } from "../hulp/nepdom";

const eerste = JSON.parse(readFileSync("tests/regressie/fixtures/video-miniatuur-790.json", "utf8")).thumb as string;
const tweede = JSON.parse(readFileSync("tests/regressie/fixtures/voorlaadintentie-686.json", "utf8")).thumb as string;
const dom = zetNepDom({});
const { createRoot } = await import("react-dom/client");
const root = createRoot(dom.container as unknown as Element);
const toon = (urls: string[]) => act(async () => root.render(createElement(Thumb, { urls })));
const img = () => dom.container.vind((n) => n.nodeName === "img")[0];
const fout = (n: Knoop) => {
  const sleutel = Object.keys(n).find((k) => k.startsWith("__reactProps$"));
  assert.ok(sleutel);
  const handler = n[sleutel].onError;
  return () => handler({ currentTarget: n });
};

await toon([eerste, tweede]);
const oudeFout = fout(img());
await act(async () => oudeFout());
assert.equal(img().getAttribute("src"), bronUrl(tweede));
await toon([eerste, tweede]);
assert.equal(img().getAttribute("src"), bronUrl(tweede));
await toon([tweede, eerste]);
assert.equal(img().getAttribute("src"), bronUrl(tweede));
await act(async () => oudeFout());
assert.equal(img().getAttribute("src"), bronUrl(tweede), "late fout mag de nieuwe lijst niet doorschuiven");
await act(async () => fout(img())());
assert.equal(img().getAttribute("src"), bronUrl(eerste));
await act(async () => fout(img())());
assert.equal(img(), undefined);
await toon([tweede, eerste]);
assert.equal(img(), undefined, "dezelfde lijst herstart niet na uitputting");
await act(async () => root.unmount());
console.log("✓ nieuwsminiatuur herstelt na verversing en negeert late fouten");

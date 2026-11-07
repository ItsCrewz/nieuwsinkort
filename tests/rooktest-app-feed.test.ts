// Rooktests (#570): App en Feed renderen met de bestaande stubs, zodat de grote extracties (#302) niet alleen op tsc steunen.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { zetNepDom } from "./hulp/nepdom";
import type { Data, Item, Video } from "../src/types";

const nu = new Date();
const iso = nu.toISOString();
const item = (n: number): Item => ({
  cat: "nl",
  kop: `Rooktest kop nummer ${n} over een gemeenteraad`,
  ai: `Kern van bericht ${n}`,
  samenvatting: `Samenvatting van bericht ${n} met genoeg woorden.`,
  punten: [`Punt ${n} een`, `Punt ${n} twee`],
  tijd: iso,
  bronnen: [{ site: "NOS", href: `https://nos.nl/artikel/${n}` }],
});
const video = (n: number): Video => ({
  titel: `Rooktest video ${n}`,
  ai: `Video ${n} kort`,
  bron: "Dumpert",
  href: `https://www.dumpert.nl/item/${n}_abc`,
  thumb: `https://media.dumpert.nl/thumb/${n}.jpg`,
  populariteit: "1000",
  tijd: iso,
  soort: "short",
  embed: `https://media.dumpert.nl/video/${n}.mp4`,
});
const DAG = "De dagsamenvatting van de rooktest is hier.";
const data: Data = {
  datum: "donderdag 5 november",
  dag_samenvatting: DAG,
  weer: { plaats: "Nederland", bijgewerkt: iso, verwachting: "Droog.", waarschuwing: "", dagen: [], bronnen: [] },
  filmpjes: [],
  dumpert: [],
  items: [item(1), item(2), item(3)],
  gegenereerd: iso,
};

const dom = zetNepDom({ "/data.json": data, "/bronnen.json": { gegenereerd: "2026-11-05", groepen: [] } });
const fouten: unknown[][] = [];
const origError = console.error;
console.error = (...a: unknown[]) => void fouten.push(a);
const { createRoot } = await import("react-dom/client");
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

// App
{
  const { default: App } = await import("../src/App");
  const root = createRoot(dom.container as unknown as Element);
  await act(async () => root.render(createElement(App)));
  await act(async () => wacht(50));
  const html = dom.container.html;
  assert.ok(html.includes(DAG), "dagsamenvatting staat in de DOM");
  assert.ok(html.includes("Rooktest kop nummer 1"), "minstens één kop staat in de DOM");
  assert.ok(dom.calls.includes("/data.json"), "data.json is opgehaald");
  await act(async () => root.unmount());
}

// Feed
{
  const { Feed } = await import("../src/feed");
  const calls0 = dom.calls.length;
  const container = dom.doc.createElement("div");
  dom.doc.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  const list = [1, 2, 3].map(video);
  await act(async () => root.render(createElement(Feed, { list, cat: "dumpert", start: null, onClose: () => {} })));
  await act(async () => wacht(20));
  const slides = dom.doc.body.vind((n) => n.nodeType === 1 && (n.attrs.get("class") ?? "").split(" ").includes("fslide"));
  assert.equal(slides.length, 3, "3 slides in de DOM");
  assert.equal(dom.calls.length, calls0, "Feed doet zelf geen netwerkverkeer");
  await act(async () => root.unmount());
}

console.error = origError;
assert.deepEqual(fouten, [], "geen console.error");
console.log("rooktest App en Feed geslaagd");

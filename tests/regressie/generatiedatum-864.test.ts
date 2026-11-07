import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { zetNepDom } from "../hulp/nepdom";
import { artikelId, artikelPad } from "../../src/artikelid";
import { artikelUrl } from "../../src/delen";
import { ams } from "../../src/tijd";

const bron = JSON.parse(readFileSync("public/data.json", "utf8"));
const item = bron.items[0];
const antwoorden: Record<string, unknown> = { "/data.json": bron, "/bronnen.json": { gegenereerd: "2026-11-05", groepen: [] } };
const dom = zetNepDom(antwoorden);
const { createRoot } = await import("react-dom/client");
const { default: App } = await import("../../src/App");
const wacht = () => new Promise((r) => setTimeout(r, 80));

for (const datum of [undefined, "ongeldig"]) {
  antwoorden["/data.json"] = { ...bron, gegenereerd: datum };
  for (const hash of ["#/", `#/bericht/${artikelId(item)}`]) {
    window.location.hash = hash;
    const root = createRoot(dom.container as unknown as Element);
    await act(async () => root.render(createElement(App)));
    await act(wacht);
    assert.ok(dom.container.html.includes("Het nieuws laden lukt even niet."));
    assert.ok(dom.container.html.includes("Probeer opnieuw"));
    await act(async () => root.unmount());
  }
}
antwoorden["/data.json"] = { ...bron, gegenereerd: new Date().toISOString(), items: [{ ...item, t: new Date().toISOString() }] };
window.location.hash = `#/bericht/${artikelId(item)}`;
{
  const root = createRoot(dom.container as unknown as Element);
  await act(async () => root.render(createElement(App)));
  await act(wacht);
  assert.ok(dom.doc.body.html.includes("Deel dit bericht"), "artikel met geldige datum opent");
  await act(async () => root.unmount());
}
for (const [datum, dag] of [["2026-01-01T22:59:59Z", "2026-01-01"], ["2026-01-01T23:00:00Z", "2026-01-02"]]) {
  const pad = artikelPad(item, ams(Date.parse(datum)).iso);
  assert.ok(pad.startsWith(`/bericht/${dag}/`));
  assert.equal(artikelUrl(item, ams(Date.parse(datum)).iso), `https://nieuwsinkort.nl${pad}`);
}
console.log("✓ generatiedatum en artikelroute");

// #1278: elke "Lees verder"-link heeft een toegankelijke naam met de kop; tekst, href en andere links blijven gelijk.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { zetNepDom } from "./hulp/nepdom";
import type { Item } from "../src/types";

const t = (name: string, fn: () => void) => { fn(); console.log("ok", name); };
zetNepDom({});
const { KaartInhoud } = await import("../src/App");
const { itemKey } = await import("../src/nieuws-hulp");
const { artikelId } = await import("../src/artikelid");
const item = (kop: string, n: number): Item => ({
  cat: "nl", kop, ai: `Kern ${n} van het bericht`, samenvatting: `Samenvatting ${n} met genoeg woorden erin.`,
  bronnen: [{ site: "NOS", href: `https://nos.nl/artikel/${n}` }],
});
const render = (it: Item) => renderToStaticMarkup(createElement(KaartInhoud, { item: it, i: 5, bionic: false, onOpen: () => {}, zoekterm: "" }));
const leesverder = (html: string) => [...html.matchAll(/<a [^>]*>\s*Lees verder\s*<\/a>/g)].map((m) => m[0]);

t("naam bevat actie en kop, zichtbare tekst en href blijven", () => {
  const a = item("Gemeenteraad besluit over de brug", 1);
  const html = render(a);
  const [link] = leesverder(html);
  assert.ok(link);
  assert.match(link, /aria-label="Lees verder: Gemeenteraad besluit over de brug"/);
  assert.ok(link.includes(`href="#/bericht/${artikelId(a) || itemKey(a)}"`));
  assert.match(html, /<a [^>]*href="https:\/\/nos\.nl\/artikel\/1"[^>]*target="_blank"/);
  assert.match(html, /<h2 class="nc-title"><a href="#\/bericht\//);
});
t("meerdere kaarten krijgen hun eigen naam, ook bij dubbele kop", () => {
  const items = [item("Eerste kop", 1), item("Tweede kop", 2), item("Eerste kop", 3)];
  const namen = items.map((it) => leesverder(render(it))[0].match(/aria-label="([^"]*)"/)![1]);
  assert.deepEqual(namen, ["Lees verder: Eerste kop", "Lees verder: Tweede kop", "Lees verder: Eerste kop"]);
  const hrefs = items.map((it) => leesverder(render(it))[0].match(/href="([^"]*)"/)![1]);
  // dubbele kop: elk bericht heeft een eigen bestemming (artikel-id), dus de tweede opent niet de eerste
  assert.notEqual(hrefs[0], hrefs[2]);
  assert.notEqual(hrefs[0], hrefs[1]);
  // elke href leidt met dezelfde selectie als App.selectedItem naar het eigen item
  hrefs.forEach((h, n) => {
    const sel = h.replace("#/bericht/", "");
    assert.equal(items.find((i) => itemKey(i) === sel || artikelId(i) === sel), items[n]);
  });
});
t("na nieuwe data volgt de naam de nieuwe kop", () => {
  const voor = leesverder(render(item("Oude kop", 1)))[0];
  const na = leesverder(render(item("Nieuwe kop & meer", 1)))[0];
  assert.match(voor, /Lees verder: Oude kop"/);
  assert.match(na, /Lees verder: Nieuwe kop &amp; meer"/);
});

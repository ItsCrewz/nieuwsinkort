// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { hostVan, isNL } from "../src/bronlink";
import { parseFeed } from "../worker/src/parse";
import { schoon } from "../src/schoon";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

t("bronlinks: ongeldige en relatieve links zijn geen Nederlandse bron", () => {
  for (const href of ["/relatief", "rommel", "www.site.nl/a", "javascript:x", "", "https://nos.nl.evil.com/a", "https://example.com/nos.nl/a"]) {
    assert.equal(isNL({ c: [{ href }] }), false, href);
  }
  assert.equal(hostVan("/relatief"), "");
  assert.equal(hostVan("rommel"), "");
  assert.equal(hostVan("javascript:x"), "");
  assert.equal(hostVan("https://nos.nl/a"), "nos.nl");
  assert.equal(isNL({ c: [{ href: "https://nos.nl/a" }] }), true);
});

t("bronlinks: fallback zonder AI gaat door na een ongeldige bron", () => {
  const clusters = [
    { c: [{ href: "/relatief", s: "Feedtekst" }] },
    { c: [{ href: "rommel", s: "Feedtekst" }, { href: "https://nos.nl/a", s: "Nieuws" }] },
  ];
  const noAI = true;
  const shown = clusters.filter((k) => noAI && isNL(k) && k.c[0].s);
  assert.deepEqual(shown, [clusters[1]]);
  assert.equal(isNL({ c: [] }), false);
});

t("parseFeed: javascript:-link (ook als entity) wordt leeg, relatieve link absoluut", () => {
  const rss = (l: string) => `<rss><channel><item><title>x</title><link>${l}</link></item></channel></rss>`;
  assert.equal(parseFeed(rss("javascript:alert(1)"), "https://x.nl/rss")[0].l, "");
  assert.equal(parseFeed(rss("&#106;avascript:alert(1)"), "https://x.nl/rss")[0].l, "");
  assert.equal(parseFeed(rss("/nieuws/1"), "https://x.nl/rss")[0].l, "https://x.nl/nieuws/1");
  assert.equal(parseFeed(JSON.stringify([{ title: "a", url: "javascript:alert(1)" }]), "https://x.nl/api")[0].l, "https://x.nl/api");
});

t("schoon: bronnen met niet-http(s) href vallen weg", () => {
  const r = schoon({ items: [{ bronnen: [{ naam: "a", href: "javascript:alert(1)" }, { naam: "b", href: "https://x.nl/b" }, { naam: "c" }] }] });
  assert.deepEqual(r.items[0].bronnen.map((b: any) => b.naam), ["b"]);
});

console.log(`\n${n} tests geslaagd`);

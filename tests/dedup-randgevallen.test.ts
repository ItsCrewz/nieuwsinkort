// Draai: npm test  (randgevallen voor canonUrl, titleTokens, popNum en dedupVideos)
import assert from "node:assert/strict";
import { canonUrl, dedupVideos, popNum, titleTokens, type DVideo } from "../src/dedup";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("canonUrl haalt www-, m-, mobile- en old-subdomeinen weg", () => {
  assert.equal(canonUrl("https://www.nos.nl/artikel/123"), "nos.nl/artikel/123");
  assert.equal(canonUrl("https://m.nos.nl/artikel/123"), "nos.nl/artikel/123");
  assert.equal(canonUrl("https://mobile.twitter.com/NOS/status/1"), "x.com/NOS/status/1");
  assert.equal(canonUrl("https://old.reddit.com/r/nl/comments/ab/"), "reddit.com/r/nl/comments/ab");
});

t("canonUrl haalt maar één subdomein weg en laat andere subdomeinen staan", () => {
  assert.equal(canonUrl("https://www.m.nos.nl/a"), "m.nos.nl/a");
  assert.equal(canonUrl("https://shop.nos.nl/a"), "shop.nos.nl/a");
});

t("canonUrl verlaagt de host maar niet het pad", () => {
  assert.equal(canonUrl("https://NOS.nl/A/B"), "nos.nl/A/B");
});

t("canonUrl verwijdert trackingparameters ongeacht hoofdletters", () => {
  assert.equal(canonUrl("https://nos.nl/a?fbclid=1&gclid=2&mc_cid=3&utm_source=x"), "nos.nl/a");
  assert.equal(canonUrl("https://nos.nl/a?UTM_Medium=x&IGSHID=y"), "nos.nl/a");
});

t("canonUrl sorteert overgebleven parameters", () => {
  assert.equal(canonUrl("https://nos.nl/a?utm_source=x&b=2&a=1"), "nos.nl/a?a=1&b=2");
  assert.equal(canonUrl("https://nos.nl/a?b=2&a=1"), canonUrl("https://nos.nl/a?a=1&b=2"));
});

t("canonUrl negeert hash en afsluitende slashes", () => {
  assert.equal(canonUrl("https://nos.nl/a#deel"), "nos.nl/a");
  assert.equal(canonUrl("https://nos.nl/a/?utm_source=x#x"), "nos.nl/a");
  assert.equal(canonUrl("https://nos.nl/a///"), "nos.nl/a");
  assert.equal(canonUrl("https://nos.nl/"), "nos.nl");
});

t("canonUrl valt bij een ongeldige URL terug op getrimde kleine letters", () => {
  assert.equal(canonUrl("  Geen URL  "), "geen url");
  assert.equal(canonUrl(""), "");
});

t("titleTokens haalt leestekens weg en verlaagt hoofdletters", () => {
  assert.deepEqual(titleTokens("Brand in Haarlem!!! Brandweer, rukt uit?"), ["brand", "haarlem", "brandweer", "rukt"]);
  assert.deepEqual(titleTokens("BRAND IN HAARLEM"), titleTokens("brand in haarlem"));
});

t("titleTokens haalt diakrieten weg", () => {
  assert.deepEqual(titleTokens("Café Überzwaar"), ["cafe", "uberzwaar"]);
  assert.deepEqual(titleTokens("Één"), []);
});

t("titleTokens ontdubbelt en laat korte woorden en stopwoorden weg", () => {
  assert.deepEqual(titleTokens("Brand brand BRAND haarlem"), ["brand", "haarlem"]);
  assert.deepEqual(titleTokens("De en het video nieuws"), []);
  assert.deepEqual(titleTokens("AI en EU op 12 mei 2026"), ["mei", "2026"]);
});

t("titleTokens haalt bronachtervoegsels en hashtags weg", () => {
  assert.deepEqual(titleTokens("Kabinet valt | RTL Nieuws"), ["kabinet", "valt"]);
  assert.deepEqual(titleTokens("Kabinet valt – NOS"), ["kabinet", "valt"]);
  assert.deepEqual(titleTokens("#nieuws #haarlem dag"), ["dag"]);
});

t("titleTokens geeft een lege lijst voor lege invoer", () => {
  assert.deepEqual(titleTokens(""), []);
  assert.deepEqual(titleTokens(undefined as unknown as string), []);
});

t("popNum leest K met komma als decimaalteken", () => {
  assert.equal(popNum("1,2K"), 1200);
  assert.equal(popNum("1,2k views"), 1200);
  assert.equal(popNum("1.5k"), 1500);
});

t("popNum leest mln en M als miljoen", () => {
  assert.equal(popNum("3 mln"), 3e6);
  assert.equal(popNum("3 mln views"), 3e6);
  assert.equal(popNum("3M"), 3e6);
});

t("popNum leest punten als duizendtallen", () => {
  assert.equal(popNum("1.234 views"), 1234);
  assert.equal(popNum("1.234.567 views"), 1234567);
});

t("popNum weegt likes en kudos twintig keer", () => {
  assert.equal(popNum("5 likes"), 100);
  assert.equal(popNum("1,2K kudos"), 24000);
});

t("popNum geeft 0 voor onzin en lege invoer", () => {
  for (const p of ["onzin", "", "...", undefined]) assert.equal(popNum(p), 0, String(p));
  assert.equal(popNum("abc 7"), 7);
});

const v = (titel: string, href: string, bron = "YouTube"): DVideo => ({ titel, href, bron });

t("dedupVideos met een lege lijst geeft niets terug, ook met against", () => {
  assert.deepEqual(dedupVideos([]), { list: [], removed: 0, groups: [] });
  assert.deepEqual(dedupVideos([], [v("Iets", "https://www.dumpert.nl/item/1_abc", "Dumpert")]), { list: [], removed: 0, groups: [] });
});

t("dedupVideos zonder against en zonder dubbelen laat lijst en volgorde staan", () => {
  const lijst = [v("Brand in Haarlem centrum", "https://nos.nl/a"), v("Storm raast over Zeeland", "https://nos.nl/b")];
  const r = dedupVideos(lijst);
  assert.deepEqual(r.list, lijst);
  assert.equal(r.removed, 0);
  assert.deepEqual(r.groups, []);
});

t("dedupVideos haalt items weg die via URL of titel al in against staan", () => {
  const against = [v("Kat redt hond uit sloot bij Alkmaar", "https://www.dumpert.nl/item/100_abc", "Dumpert")];
  const r = dedupVideos([
    v("Ander filmpje", "https://dumpert.nl/item/100_abc/?utm_source=x", "Reddit"),
    v("Kat redt hond uit sloot bij Alkmaar | NH Nieuws", "https://www.youtube.com/shorts/aaaaaaaaaaa"),
    v("Storm raast over Zeeland", "https://nos.nl/b"),
  ], against);
  assert.deepEqual(r.list.map((x) => x.href), ["https://nos.nl/b"]);
  assert.equal(r.removed, 2);
  assert.equal(r.groups.length, 2);
  for (const g of r.groups) assert.match(g[0], /\(al bij Dumpert\)$/);
});

t("dedupVideos telt bij against de hele groep dubbelen als verwijderd", () => {
  const against = [v("Iets", "https://www.youtube.com/watch?v=bbbbbbbbbbb", "Dumpert")];
  const r = dedupVideos([
    v("Eerste", "https://youtu.be/bbbbbbbbbbb"),
    v("Tweede", "https://www.youtube.com/shorts/bbbbbbbbbbb", "Instagram"),
  ], against);
  assert.deepEqual(r.list, []);
  assert.equal(r.removed, 2);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].length, 2);
});

t("dedupVideos laat de invoer ongemoeid", () => {
  const lijst = [v("Eerste", "https://youtu.be/ccccccccccc"), v("Tweede", "https://www.youtube.com/shorts/ccccccccccc", "Instagram")];
  const kopie = structuredClone(lijst);
  const r = dedupVideos(lijst);
  assert.equal(r.list.length, 1);
  assert.ok(r.list[0].ook?.length);
  assert.deepEqual(lijst, kopie);
});

console.log(`\n${n} tests geslaagd`);

// #1222: een zwakke tekstmatch (titel/caption/uitgever) voegt nooit twee aantoonbaar verschillende video's samen via een brug.
import assert from "node:assert/strict";
import { dedupVideos } from "../../src/dedup";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const TITEL = "Brand in Haarlemse binnenstad: brandweer rukt groots uit na melding van omwonenden";
const yt = (id: string, titel = TITEL) => ({ titel, href: `https://www.youtube.com/watch?v=${id}`, bron: "YouTube" });

t("A–B en B–C tekstmatch, A en C verschillende yt-id's: beide blijven", () => {
  const B = { titel: TITEL, href: "https://example.org/nieuws/brand", bron: "Web" };
  const r = dedupVideos([yt("aaaaaaaaaaa"), B, yt("ccccccccccc")]);
  assert.equal(r.list.filter((v) => v.href.includes("aaaaaaaaaaa") || v.href.includes("ccccccccccc")).length, 2);
});

t("kopieën met dezelfde id blijven samen en houden ook", () => {
  const r = dedupVideos([yt("aaaaaaaaaaa"), { ...yt("aaaaaaaaaaa"), href: "https://youtu.be/aaaaaaaaaaa", bron: "Kopie" }]);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].ook?.length, 1);
});

t("YouTube ↔ Instagram van dezelfde uitgever blijft samen", () => {
  const r = dedupVideos([
    { titel: "Een steen als huisdier in huis", href: "https://www.youtube.com/watch?v=aaaaaaaaaaa", embed: "https://www.youtube.com/embed/aaaaaaaaaaa", bron: "YouTube", _k: "NU.nl", ai: "Een steen als huisdier in huis, vertelt een vrouw." },
    { titel: "Een steen als huisdier in huis", href: "https://www.instagram.com/reel/ABC12345/", bron: "Instagram", _k: "nu.nl" },
  ]);
  assert.equal(r.list.length, 1);
});

t("against: andere dp-id met gelijke titel blokkeert niet, zelfde id of titel zonder id wel", () => {
  const dp = (id: string) => ({ titel: TITEL, href: `https://www.dumpert.nl/item/${id}`, bron: "Dumpert" });
  assert.equal(dedupVideos([{ ...yt("aaaaaaaaaaa"), href: "https://www.dumpert.nl/item/1111-x" }], [dp("2222-y")]).list.length, 1);
  assert.equal(dedupVideos([{ ...yt("aaaaaaaaaaa"), href: "https://www.dumpert.nl/item/1111-x" }], [dp("1111-x")]).list.length, 0);
  assert.equal(dedupVideos([yt("aaaaaaaaaaa")], [dp("2222-y")]).list.length, 0);
});
console.log(`${n} tests`);

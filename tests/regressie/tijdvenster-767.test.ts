import assert from "node:assert/strict";
import { volgendeGrens } from "../../src/useklok";
import { filterNieuws, filterVideos, STANDAARD } from "../../src/filters";
import type { Item, Video } from "../../src/types";

const nu = Date.parse("2026-11-05T12:00:00Z");
const item = { kop: "Bericht", cat: "nl", t: nu - 3600e3 + 500, bronnen: [] } as Item;
const video = { titel: "Video", t: nu - 3600e3 + 250 } as Video;
const data = { items: [item], filmpjes: [video], dumpert: [video], gegenereerd: new Date(nu).toISOString() };
assert.equal(volgendeGrens(data, "1u", 0, nu), nu + 251);
assert.equal(volgendeGrens(data, "alles", 0, nu), nu + 501);
const origineel = Date.now;
try {
  Date.now = () => nu;
  const f = { ...STANDAARD, tijd: "1u" as const };
  assert.equal(filterNieuws(data.items, f, 0, data.gegenereerd, true).per["1u"], 1);
  assert.equal(filterVideos(data.filmpjes, f, 0, data.gegenereerd).length, 1);
  Date.now = () => nu + 501;
  assert.equal(filterNieuws(data.items, f, 0, data.gegenereerd, true).per["1u"], 0);
  assert.equal(filterVideos(data.dumpert, f, 0, data.gegenereerd).length, 0);
} finally { Date.now = origineel; }
console.log("✓ tijdgrenzen voor nieuws en video's");

import assert from "node:assert/strict";
import { filterVideos, STANDAARD, type Tijd } from "../../src/filters";
import { selecteerVideodag } from "../../src/vandaag";
import type { Video } from "../../src/types";

const video = (t: number, tijd: string): Video => ({ t, tijd, titel: "Filmpje", ai: "", bron: "", href: "https://voorbeeld.nl/video", thumb: "", populariteit: "" });
const oudeKlok = Date.now;
try {
  for (const [nu, publicatie] of [
    ["2026-11-03T07:15:00+01:00", "2026-11-02T07:10:00+01:00"],
    ["2026-03-29T03:15:00+02:00", "2026-03-28T03:10:00+01:00"],
    ["2026-10-25T02:15:00+01:00", "2026-10-24T02:10:00+02:00"],
  ]) {
    const now = Date.parse(nu);
    Date.now = () => now;
    const oud = video(Date.parse(publicatie), nu.slice(11, 13) + ":10");
    const terugval = selecteerVideodag([oud], now, (v) => v.t);
    assert.equal(terugval.length, 1);
    const kies = (tijd: Tijd, lijst = terugval, vorig = now - 3600e3) => filterVideos(lijst, { ...STANDAARD, tijd }, vorig, nu);
    assert.deepEqual(kies("alles"), terugval);
    for (const tijd of ["vandaag", "1u", "3u", "sinds"] as const) assert.deepEqual(kies(tijd), []);
    const nieuw = video(now - 5 * 60e3, "00:00");
    assert.deepEqual(kies("vandaag", [nieuw]), [nieuw]);
    assert.deepEqual(kies("1u", [nieuw]), [nieuw]);
    const legacy = { ...oud, t: undefined, gisteren: true };
    assert.deepEqual(kies("vandaag", [legacy]), []);
    assert.deepEqual(kies("1u", [{ ...legacy, t: NaN }]), []);
    assert.deepEqual(kies("alles", [legacy]), [legacy]);
  }
  Date.now = () => Date.parse("2026-11-03T00:15:00+01:00");
  const recentGisteren = video(Date.parse("2026-11-02T23:50:00+01:00"), "23:50");
  assert.deepEqual(filterVideos([recentGisteren], { ...STANDAARD, tijd: "vandaag" }, 0, "2026-11-03T00:15:00+01:00"), []);
  assert.deepEqual(filterVideos([recentGisteren], { ...STANDAARD, tijd: "1u" }, 0, "2026-11-03T00:15:00+01:00"), [recentGisteren]);
} finally { Date.now = oudeKlok; }
console.log("✓ videofilters gebruiken de publicatiedatum");

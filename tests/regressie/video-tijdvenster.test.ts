import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterVideos, STANDAARD } from "../../src/filters";
import type { Video } from "../../src/types";

// Bewaak de echte App-bedrading: de klok mag alleen op videoroutes lopen en
// een tik moet de memo met beide videolijsten ongeldig maken.
const bron = readFileSync("src/App.tsx", "utf8");
assert.match(bron, /const videoKlok = useVideoKlok\(route\.video \? flt\.f\.tijd : "alles"\)/);
assert.match(bron, /const vids = useMemo\([\s\S]*?\[data, flt\.f, flt\.vorig, klok, videoKlok\]\s*\)/);

const data = [{ titel: "Grens", tijd: "11:00" }] as Video[];
const gegenereerd = "2026-10-30T12:00:00+01:00";
const echteNu = Date.now;
try {
  let nu = Date.parse(gegenereerd);
  Date.now = () => nu;
  assert.equal(filterVideos(data, { ...STANDAARD, tijd: "1u" }, 0, gegenereerd).length, 1);
  nu += 60_000;
  assert.equal(filterVideos(data, { ...STANDAARD, tijd: "1u" }, 0, gegenereerd).length, 0);
  assert.equal(filterVideos(data, { ...STANDAARD, tijd: "3u" }, 0, gegenereerd).length, 1);
  nu += 2 * 3600_000;
  assert.equal(filterVideos(data, { ...STANDAARD, tijd: "3u" }, 0, gegenereerd).length, 0);
} finally {
  Date.now = echteNu;
}

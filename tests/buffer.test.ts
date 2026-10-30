// Draai: npm run test  (buffergrenzen van de videofeed, src/buffer.ts)
import assert from "node:assert/strict";
import { mountSet, niveauVan, planVoor, posterEager, warmPlan } from "../src/buffer";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("netwerkniveau: Save-Data en 2g = minimaal, 3g = zuinig, rest = ruim", () => {
  assert.equal(niveauVan(undefined), "ruim");
  assert.equal(niveauVan({ effectiveType: "4g" }), "ruim");
  assert.equal(niveauVan({ effectiveType: "3g" }), "zuinig");
  assert.equal(niveauVan({ effectiveType: "2g" }), "minimaal");
  assert.equal(niveauVan({ effectiveType: "slow-2g" }), "minimaal");
  assert.equal(niveauVan({ saveData: true, effectiveType: "4g" }), "minimaal");
});
t("actieve video mag ruim bufferen", () => {
  const p = planVoor(0, "minimaal");
  assert.ok(p.mount && p.laden && p.secs >= 30 && p.mp4 === "auto");
});
t("volgende video: begrensd per niveau (secs en bytes), minimaal laadt geen media", () => {
  const r = planVoor(1, "ruim");
  const z = planVoor(1, "zuinig");
  const m = planVoor(1, "minimaal");
  assert.ok(r.mount && r.laden && r.secs <= 15 && r.bytes <= 4e6 && r.mp4 === "auto");
  assert.ok(z.laden && z.secs < r.secs && z.bytes < r.bytes && z.mp4 === "metadata");
  assert.ok(m.mount && !m.laden && m.secs === 0 && m.bytes === 0 && m.mp4 === "metadata");
});
t("niets vooruit bufferen vanaf +2 (geen speler)", () => {
  for (const d of [2, 3, 4, 10]) for (const nv of ["ruim", "zuinig", "minimaal"] as const) {
    const p = planVoor(d, nv);
    assert.ok(!p.mount && !p.laden && p.secs === 0 && p.bytes === 0);
  }
});
t("vorige video blijft gemount (niet op Apple), vult hooguit een paar seconden bij", () => {
  const p = planVoor(-1, "ruim");
  assert.ok(p.mount && p.laden && p.secs <= 6 && p.bytes <= 2e6 && p.mp4 === "metadata");
  const m = planVoor(-1, "minimaal");
  assert.ok(m.mount && !m.laden && m.secs === 0);
  assert.equal(planVoor(-1, "ruim", true).mount, false);
  assert.equal(planVoor(-2, "ruim").mount, false);
});
t("mountSet: vorige, actieve en volgende, binnen de lijst", () => {
  assert.deepEqual([...mountSet(3, 10, "ruim")].sort(), [2, 3, 4]);
  assert.deepEqual([...mountSet(0, 10, "ruim")].sort(), [0, 1]);
  assert.deepEqual([...mountSet(9, 10, "ruim")].sort(), [8, 9]);
  assert.deepEqual([...mountSet(3, 10, "ruim", true)].sort(), [3, 4]);
  assert.deepEqual([...mountSet(0, 1, "minimaal")], [0]);
});
t("opwarmen: +2 playlist en segmenten (alleen ruim), +3 alleen playlist, +4 niets, minimaal geen segmenten", () => {
  assert.deepEqual(warmPlan(2, "ruim"), { playlist: true, segmenten: 2 });
  assert.deepEqual(warmPlan(2, "zuinig"), { playlist: true, segmenten: 0 });
  assert.deepEqual(warmPlan(3, "ruim"), { playlist: true, segmenten: 0 });
  assert.deepEqual(warmPlan(3, "minimaal"), { playlist: false, segmenten: 0 });
  assert.deepEqual(warmPlan(4, "ruim"), { playlist: false, segmenten: 0 });
  assert.deepEqual(warmPlan(1, "minimaal"), { playlist: true, segmenten: 0 });
  assert.deepEqual(warmPlan(1, "ruim"), { playlist: false, segmenten: 0 });
  for (const d of [1, 2, 3, 4]) assert.equal(warmPlan(d, "minimaal").segmenten, 0);
});
t("posters laden eager van -1 t/m +3", () => {
  assert.ok(posterEager(-1) && posterEager(0) && posterEager(3));
  assert.ok(!posterEager(-2) && !posterEager(4));
});
console.log(`${n} tests ok`);
